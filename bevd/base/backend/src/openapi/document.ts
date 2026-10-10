import type { JsonSchema, Type } from "arktype";
import packageJson from "../../package.json";
import { ErrorBody } from "../rest/error-body";
import { type ApiRoute, describedRoutes, named, namedComponents } from "./registry";

named("ErrorBody", ErrorBody);

/**
 * OpenAPI 3.1, because that is what arktype's toJsonSchema() speaks: draft 2020-12, with
 * `const` and `{ "type": "null" }` where 3.0 would need `enum` and `nullable`. Rewriting it
 * down to 3.0 would be a second converter to keep correct, for no client that needs it.
 */
const OPENAPI_VERSION = "3.1.2";

const DESCRIPTION = [
	"The REST surface of bevd/base. Every route here calls the same service function, with",
	"the same arktype schema, as its tRPC twin.",
	"",
	"Only part of the API is REST. The tRPC procedures without a twin (post.update,",
	"post.delete, health.ping, health.db) are RPC-only: call them through /trpc with the",
	"typed tRPC client, or over gRPC.",
].join("\n");

type JsonObject = { [key: string]: unknown };

/**
 * arktype's JSON Schema for one schema.
 *
 * Two things in this codebase have no JSON Schema of their own. A Date becomes an ISO 8601
 * string, which is what JSON serialisation turns it into. A `.narrow()` becomes its base
 * type plus its description, and a narrow with no description is refused: it is a rule
 * the client cannot see, so it must at least be able to read it.
 */
export function toJson(schema: Type, where: string): JsonObject {
	const { $schema: _dialect, ...json } = schema.toJsonSchema({
		fallback: {
			date: (ctx) => ({ ...ctx.base, type: "string", format: "date-time" }),
			predicate: (ctx) => {
				if (!ctx.base.description) {
					throw new Error(
						`${where} has a .narrow() with no description. Add .describe() so the document can state the rule.`,
					);
				}

				return ctx.base;
			},
		},
	}) as JsonSchema & { $schema?: string };

	return json as JsonObject;
}

/**
 * Swaps every subtree that is exactly a named component's JSON Schema for a `$ref` to it.
 *
 * arktype inlines everything, so this is how a list of posts comes to say `items: Post`
 * rather than repeating Post. Matching on the rendered JSON is exact: two subtrees that
 * render the same are the same schema as far as any client can tell.
 */
function withRefs(node: unknown, components: Map<string, string>, skip?: string): unknown {
	if (Array.isArray(node)) return node.map((item) => withRefs(item, components));
	if (node === null || typeof node !== "object") return node;

	const rendered = JSON.stringify(node);
	for (const [id, json] of components) {
		if (id !== skip && json === rendered) return { $ref: `#/components/schemas/${id}` };
	}

	return Object.fromEntries(
		Object.entries(node).map(([key, value]) => [key, withRefs(value, components)]),
	);
}

const openApiPath = (path: string): string => path.replace(/:(\w+)/g, "{$1}");

function parameters(
	location: "path" | "query",
	schema: Type | undefined,
	route: ApiRoute,
	components: Map<string, string>,
): JsonObject[] {
	if (!schema) return [];

	const json = toJson(schema, `${route.operationId} ${location}`);
	const properties = (json.properties ?? {}) as Record<string, JsonObject>;
	const required = new Set((json.required ?? []) as string[]);

	return Object.entries(properties).map(([name, property]) => ({
		name,
		in: location,
		required: location === "path" || required.has(name),
		...(typeof property.description === "string" ? { description: property.description } : {}),
		schema: withRefs(property, components),
	}));
}

function operation(route: ApiRoute, components: Map<string, string>): JsonObject {
	const body = route.request?.body;

	const params = [
		...parameters("path", route.request?.params, route, components),
		...parameters("query", route.request?.query, route, components),
	];

	return {
		operationId: route.operationId,
		summary: route.summary,
		...(route.description ? { description: route.description } : {}),
		tags: [...route.tags],
		...(params.length > 0 ? { parameters: params } : {}),
		...(body
			? {
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: withRefs(
									toJson(body, `${route.operationId} body`),
									components,
								),
							},
						},
					},
				}
			: {}),
		responses: Object.fromEntries(
			Object.entries(route.responses).map(([status, response]) => {
				if (typeof response === "string") {
					return [
						status,
						{
							description: response,
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ErrorBody" },
								},
							},
						},
					];
				}

				const schema = response.schema;

				return [
					status,
					{
						description: response.description,
						...(schema
							? {
									content: {
										"application/json": {
											schema: withRefs(
												toJson(schema, `${route.operationId} ${status}`),
												components,
											),
										},
									},
								}
							: {}),
					},
				];
			}),
		),
	};
}

export function buildOpenApiDocument(): JsonObject {
	const routes = describedRoutes();

	const rendered = new Map<string, string>();
	for (const [id, schema] of namedComponents()) {
		rendered.set(id, JSON.stringify(toJson(schema, `component ${id}`)));
	}

	const paths: Record<string, Record<string, JsonObject>> = {};
	for (const route of routes) {
		const path = openApiPath(route.path);
		paths[path] ??= {};
		paths[path][route.method] = operation(route, rendered);
	}

	const tags = [...new Set(routes.flatMap((route) => route.tags))].map((name) => ({ name }));

	return {
		openapi: OPENAPI_VERSION,
		info: { title: "bevd-base", version: packageJson.version, description: DESCRIPTION },
		tags,
		paths,
		components: {
			schemas: Object.fromEntries(
				[...rendered].map(([id, json]) => [id, withRefs(JSON.parse(json), rendered, id)]),
			),
		},
	};
}
