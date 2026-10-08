import type { Type } from "arktype";
import { REST_PREFIX } from "../rest";
import { appRouter } from "../trpc/routers";
import {
	type Access,
	type ApiResponse,
	type ApiRoute,
	describedRoutes,
	type HttpMethod,
	namedComponents,
} from "./registry";

type JsonSchema = Record<string, unknown>;
type SecurityRequirement = Record<string, string[]>;

/**
 * OpenAPI 3.1, not 3.0.3, because arktype's toJsonSchema() writes JSON Schema 2020-12 -
 * `const` for a literal, `anyOf` for the three spellings of a UUID - and 3.1 is the
 * version whose schema object is that dialect. Down-converting to 3.0's subset would
 * mean rewriting arktype's output by hand, and the document would then describe the
 * rewrite rather than the validator.
 */
const OPENAPI_VERSION = "3.1.0";

/**
 * One arktype schema as an OpenAPI schema object.
 *
 * The input side (`.in`) is what a client sends, which differs from the output only for a
 * morph (none of the request schemas has one today).
 *
 * A `.narrow()` refinement has no JSON Schema form, so the only trace it can leave in the
 * document is its description. One without a `.describe()` would vanish silently - the
 * document would promise a looser rule than the server applies - so it fails the build
 * instead. Nothing else gets a fallback: a Date or a function in a schema is a bug in the
 * schema, and arktype's own error says where.
 */
export function toSchemaObject(schema: Type): JsonSchema {
	const { $schema: _dialect, ...rest } = schema.in.toJsonSchema({
		fallback: {
			predicate: (ctx) => {
				if (!ctx.base.description) {
					throw new Error(
						"A .narrow() refinement has no description; add .describe() so the document can state the rule.",
					);
				}

				return ctx.base;
			},
		},
	}) as JsonSchema;

	return rest;
}

/**
 * Swaps every subtree that is exactly a named component for a $ref to it. arktype renders
 * a schema whole, so `PostView.array()` comes out with the Post object inlined in `items`;
 * this is what turns it back into a reference. `skip` keeps a component from referring to
 * itself.
 */
function withRefs(node: unknown, rendered: ReadonlyMap<string, string>, skip?: string): unknown {
	const text = JSON.stringify(node);

	for (const [id, json] of rendered) {
		if (id !== skip && json === text) return { $ref: `#/components/schemas/${id}` };
	}

	if (Array.isArray(node)) return node.map((item) => withRefs(item, rendered, skip));

	if (node && typeof node === "object") {
		return Object.fromEntries(
			Object.entries(node).map(([key, value]) => [key, withRefs(value, rendered, skip)]),
		);
	}

	return node;
}

const ACCESS_COOKIE_ALTERNATIVE = { accessCookie: [] };
const CSRF_PAIR = { csrfCookie: [], csrfHeader: [] };

/**
 * The security requirements of one route. The alternatives are OR-ed, the schemes inside
 * one alternative AND-ed. `{}` is the anonymous alternative.
 *
 * The cookie alternative of a non-GET route always carries the CSRF pair: that is the
 * csrfGuard in trpc/trpc.ts and its twin in rest/base.ts. A bearer header never needs it.
 */
function securityFor(access: Access, method: HttpMethod): SecurityRequirement[] | undefined {
	const cookie =
		method === "get"
			? ACCESS_COOKIE_ALTERNATIVE
			: { ...ACCESS_COOKIE_ALTERNATIVE, ...CSRF_PAIR };

	switch (access) {
		case "open":
			return undefined;
		case "anyone":
			return [{}, { bearerAuth: [] }, cookie];
		case "signedIn":
			return [{ bearerAuth: [] }, cookie];
		case "refreshCookie":
			// The browser usually sends a live access cookie alongside, and then the CSRF
			// pair is required too; without one, the refresh cookie alone is enough.
			return [{ refreshCookie: [] }, { refreshCookie: [], ...cookie }];
	}
}

const SECURITY_SCHEMES = {
	accessCookie: {
		type: "apiKey",
		in: "cookie",
		name: "access_token",
		description:
			"The access token (a lacewing at+jwt, HS256), set httpOnly, Secure and SameSite by the auth routes. A browser sends it without being asked. When both arrive, the cookie wins over a bearer header.",
	},
	bearerAuth: {
		type: "http",
		scheme: "bearer",
		bearerFormat: "JWT",
		description:
			"The same access token in `Authorization: Bearer <token>` (strict RFC 6750), for callers that are not a browser. These REST routes never hand a token out in a body; gRPC's AuthService does.",
	},
	refreshCookie: {
		type: "apiKey",
		in: "cookie",
		name: "refresh_token",
		description:
			"An opaque, single-use refresh token, httpOnly. Only refresh and logout read it.",
	},
	csrfCookie: {
		type: "apiKey",
		in: "cookie",
		name: "csrf_token",
		description:
			"The readable half of the double-submit pair, minted with every session. A second csrf_token cookie in the same request is refused outright.",
	},
	csrfHeader: {
		type: "apiKey",
		in: "header",
		name: "x-csrf-token",
		description:
			"Must equal the csrf_token cookie on every non-GET request whose access token came in the cookie. Missing or different is a 403 before the body is read.",
	},
} as const;

const ERROR_REF = { $ref: "#/components/schemas/Error" };

function operationFor(route: ApiRoute, rendered: ReadonlyMap<string, string>) {
	const schemaOf = (schema: Type) => withRefs(toSchemaObject(schema), rendered);

	const parameters = (["params", "query"] as const).flatMap((part) => {
		const schema = route.request?.[part];

		if (!schema) return [];

		const object = toSchemaObject(schema) as {
			properties?: Record<string, JsonSchema>;
			required?: string[];
		};

		return Object.entries(object.properties ?? {}).map(([name, property]) => ({
			name,
			in: part === "params" ? "path" : "query",
			required: part === "params" || (object.required ?? []).includes(name),
			schema: withRefs(property, rendered),
		}));
	});

	// Any REST route can fail unexpectedly, and rest/errors.ts answers that with the Error
	// body. Routes outside the prefix (the health probe) do not go through that handler.
	const declared: Record<number, ApiResponse | string> = route.path.startsWith(REST_PREFIX)
		? {
				500: "An unexpected failure. The body carries only the requestId to quote.",
				...route.responses,
			}
		: route.responses;

	const responses = Object.fromEntries(
		Object.entries(declared).map(([status, response]) => {
			if (typeof response === "string") {
				return [
					status,
					{
						description: response,
						content: { "application/json": { schema: ERROR_REF } },
					},
				];
			}

			return [
				status,
				{
					description: response.description,
					...(response.setsCookies && {
						headers: {
							"Set-Cookie": {
								description: "The session cookies, set or cleared.",
								schema: { type: "string" },
							},
						},
					}),
					...(response.schema && {
						content: { "application/json": { schema: schemaOf(response.schema) } },
					}),
				},
			];
		}),
	);

	const security = securityFor(route.access, route.method);

	return {
		operationId: route.operationId,
		summary: route.summary,
		...(route.description && { description: route.description }),
		tags: [...route.tags],
		...(route.procedure && { "x-trpc-procedure": route.procedure }),
		...(security && { security }),
		...(parameters.length > 0 && { parameters }),
		...(route.request?.body && {
			requestBody: {
				required: true,
				content: { "application/json": { schema: schemaOf(route.request.body) } },
			},
		}),
		responses,
	};
}

/** `/api/v1/posts/:id` to `/api/v1/posts/{id}`. */
const openApiPath = (path: string) => path.replace(/:(\w+)/g, "{$1}");

export function buildOpenApiDocument() {
	const routes = describedRoutes();

	// Every named component as JSON text, the form withRefs compares against.
	const rendered = new Map(
		[...namedComponents()].map(([id, schema]) => [id, JSON.stringify(toSchemaObject(schema))]),
	);

	const schemas = Object.fromEntries(
		[...rendered].map(([id, json]) => [id, withRefs(JSON.parse(json), rendered, id)]),
	);

	const paths: Record<string, Record<string, unknown>> = {};

	for (const route of routes) {
		const key = openApiPath(route.path);

		paths[key] = { ...paths[key], [route.method]: operationFor(route, rendered) };
	}

	const twins = new Set(routes.flatMap((route) => (route.procedure ? [route.procedure] : [])));
	const rpcOnly = Object.keys(appRouter._def.procedures).filter((name) => !twins.has(name));

	return {
		openapi: OPENAPI_VERSION,
		info: {
			title: "bevd-lacewing API",
			version: "1",
			description: [
				"The REST surface of the backend. The full API is tRPC, mounted at /trpc; the routes here are REST twins of a few of its procedures (each operation names its procedure in x-trpc-procedure), calling the same services with the same validation and the same lacewing auth.",
				`RPC-only, with no REST twin: ${rpcOnly.join(", ")}. Reach them through tRPC, or through gRPC where proto/ defines them.`,
				"Every error body is the Error schema: a stable code from the server's error vocabulary, a message, and the requestId the server logged it under.",
			].join("\n\n"),
		},
		tags: [...new Set(routes.flatMap((route) => route.tags))].map((name) => ({ name })),
		paths,
		components: {
			schemas,
			securitySchemes: SECURITY_SCHEMES,
		},
	};
}

export type OpenApiDocument = ReturnType<typeof buildOpenApiDocument>;
