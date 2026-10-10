import type { type } from "arktype";
import { type Access, type ApiRoute, describedRoutes, namedComponents } from "./registry";
import { ErrorSchema } from "./schemas";

type Json = Record<string, unknown>;

/**
 * The tRPC procedures with no REST twin. Stated in the document so a reader of the REST
 * docs knows the rest of the API exists; the test checks this list against appRouter.
 */
export const RPC_ONLY_PROCEDURES = [
	"auth.register",
	"health.ping",
	"health.db",
	"post.update",
	"post.delete",
	"user.list",
	"user.setRole",
	"user.delete",
] as const;

const DESCRIPTION = [
	"REST twins of the core tRPC procedures. Each route calls the same service function as the procedure it mirrors (see x-trpc-procedure), validates with the same arktype schema, and applies the same authorization.",
	`These procedures are RPC-only and are not described here: ${RPC_ONLY_PROCEDURES.join(", ")}. Call them over /trpc, or over gRPC.`,
].join("\n\n");

/**
 * OpenAPI 3.1, not 3.0: arktype emits JSON Schema draft 2020-12, which is what 3.1 uses.
 * Under 3.0 the `const`, `anyOf` with `type: "null"`, and `$schema` that arktype writes
 * would each need rewriting into 3.0's dialect, and the document would describe the
 * rewrite rather than the schema.
 */
const OPENAPI_VERSION = "3.1.2";

/**
 * arktype's JSON Schema, with the two things it cannot say on its own decided once:
 *
 * - date:      a Date is sent as an ISO 8601 string, because that is what JSON.stringify
 *              makes of it.
 * - predicate: a `.narrow()` is code, not a constraint JSON Schema can state. Its
 *              `.describe()` text is kept and the check itself dropped. A narrow with no
 *              description stops the build, rather than vanish from the document.
 */
export function toJson(schema: type.Any, where: string): Json {
	return schema.toJsonSchema({
		dialect: null,
		fallback: {
			date: () => ({ type: "string", format: "date-time" }),
			predicate: (ctx) => {
				if (!ctx.base.description) {
					throw new Error(`${where}: a .narrow() with no description; add .describe().`);
				}

				return ctx.base;
			},
		},
	}) as Json;
}

/**
 * arktype inlines every nested schema, so a PostList would repeat Post in full. Any
 * subtree identical to a named component becomes a $ref to it instead. Identical means
 * the same JSON, so the reference says exactly what the inlined copy said.
 */
function referencing(json: unknown, byJson: ReadonlyMap<string, string>, isRoot = true): unknown {
	if (Array.isArray(json)) return json.map((item) => referencing(item, byJson, false));

	if (json === null || typeof json !== "object") return json;

	const id = isRoot ? undefined : byJson.get(JSON.stringify(json));

	if (id) return { $ref: `#/components/schemas/${id}` };

	return Object.fromEntries(
		Object.entries(json).map(([key, value]) => [key, referencing(value, byJson, false)]),
	);
}

const SECURITY: Record<Access, Json[]> = {
	bearer: [{ bearerAuth: [] }, { accessCookie: [] }],
	// The empty requirement first: no credentials at all is an accepted way in.
	optional: [{}, { bearerAuth: [] }, { accessCookie: [] }],
	refresh: [{ refreshCookie: [] }],
	open: [],
};

const SECURITY_SCHEMES = {
	bearerAuth: {
		type: "http",
		scheme: "bearer",
		bearerFormat: "JWT",
		description: "The access token, for callers with no cookie jar.",
	},
	accessCookie: {
		type: "apiKey",
		in: "cookie",
		name: "access_token",
		description: "Set by login and refresh. httpOnly: browser script cannot read it.",
	},
	refreshCookie: {
		type: "apiKey",
		in: "cookie",
		name: "refresh_token",
		description: "Set by login and refresh. Opaque, single use.",
	},
};

/** `/api/v1/posts/:id` to `/api/v1/posts/{id}`. */
const openApiPath = (path: string): string => path.replace(/:(\w+)/g, "{$1}");

/** OpenAPI wants each path or query parameter on its own, so the object schema is split up. */
function parameters(
	schema: type.Any | undefined,
	location: "path" | "query",
	where: string,
): Json[] {
	if (!schema) return [];

	const json = toJson(schema, where) as {
		properties?: Record<string, unknown>;
		required?: string[];
	};

	return Object.entries(json.properties ?? {}).map(([name, property]) => ({
		name,
		in: location,
		required: location === "path" || (json.required ?? []).includes(name),
		schema: property,
	}));
}

function operation(route: ApiRoute, schemaFor: (schema: type.Any, where: string) => Json): Json {
	const responses = Object.fromEntries(
		Object.entries(route.responses).map(([status, response]) => {
			if (typeof response === "string") {
				return [
					status,
					{
						description: response,
						content: json(schemaFor(ErrorSchema, route.operationId)),
					},
				];
			}

			return [
				status,
				response.schema
					? {
							description: response.description,
							content: json(schemaFor(response.schema, route.operationId)),
						}
					: { description: response.description },
			];
		}),
	);

	const params = [
		...parameters(route.request?.params, "path", route.operationId),
		...parameters(route.request?.query, "query", route.operationId),
	];

	return {
		operationId: route.operationId,
		summary: route.summary,
		...(route.description && { description: route.description }),
		tags: route.tags,
		security: SECURITY[route.access],
		...(route.procedure && { "x-trpc-procedure": route.procedure }),
		...(params.length > 0 && { parameters: params }),
		...(route.request?.body && {
			requestBody: {
				required: true,
				content: json(schemaFor(route.request.body, route.operationId)),
			},
		}),
		responses,
	};
}

const json = (schema: Json): Json => ({ "application/json": { schema } });

export function buildOpenApiDocument(): Json {
	const components = namedComponents();
	const idOf = new Map([...components].map(([id, schema]) => [schema, id]));

	const componentJson = new Map(
		[...components].map(([id, schema]) => [id, toJson(schema, id)] as const),
	);
	const byJson = new Map([...componentJson].map(([id, schema]) => [JSON.stringify(schema), id]));

	const schemaFor = (schema: type.Any, where: string): Json => {
		const id = idOf.get(schema);

		if (id) return { $ref: `#/components/schemas/${id}` };

		return referencing(toJson(schema, where), byJson, false) as Json;
	};

	const paths: Record<string, Json> = {};

	for (const route of describedRoutes()) {
		const path = openApiPath(route.path);

		paths[path] = { ...paths[path], [route.method]: operation(route, schemaFor) };
	}

	const tags = [...new Set(describedRoutes().flatMap((route) => route.tags))];

	return {
		openapi: OPENAPI_VERSION,
		info: { title: "bevd-base-jwt REST API", version: "1.0.0", description: DESCRIPTION },
		tags: tags.map((name) => ({ name })),
		paths,
		components: {
			securitySchemes: SECURITY_SCHEMES,
			schemas: Object.fromEntries(
				[...componentJson].map(([id, schema]) => [id, referencing(schema, byJson)]),
			),
		},
	};
}
