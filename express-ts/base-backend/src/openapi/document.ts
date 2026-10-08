import {
	OpenAPIRegistry,
	OpenApiGeneratorV3,
	type RouteConfig,
} from "@asteasolutions/zod-to-openapi";
import { type ApiRoute, describedRoutes, errorBodySchema, namedComponents } from "./registry";

export const API_PREFIX = "/api/v1";

/** Express `/users/:id` to OpenAPI `/users/{id}`. */
const toOpenApiPath = (path: string): string => path.replace(/:(\w+)/g, "{$1}");

const responsesOf = (route: ApiRoute): RouteConfig["responses"] => {
	const responses: RouteConfig["responses"] = {};
	for (const [status, response] of Object.entries(route.responses)) {
		if (typeof response === "string") {
			responses[status] = {
				description: response,
				content: { "application/json": { schema: errorBodySchema } },
			};
		} else if (response.schema) {
			responses[status] = {
				description: response.description,
				content: { "application/json": { schema: response.schema } },
			};
		} else {
			responses[status] = { description: response.description };
		}
	}
	return responses;
};

export const buildOpenApiDocument = (): ReturnType<OpenApiGeneratorV3["generateDocument"]> => {
	const registry = new OpenAPIRegistry();

	for (const [id, schema] of namedComponents()) registry.register(id, schema);

	for (const route of describedRoutes()) {
		const { params, query, body } = route.request ?? {};
		registry.registerPath({
			method: route.method,
			path: toOpenApiPath(route.path),
			operationId: route.operationId,
			summary: route.summary,
			description: route.description,
			tags: [...route.tags],
			request: {
				params,
				query,
				body: body && {
					required: true,
					content: { "application/json": { schema: body } },
				},
			},
			responses: responsesOf(route),
		});
	}

	// Tags in the order the routes first use them, which is the index's order.
	const tags = [...new Set(describedRoutes().flatMap((route) => route.tags))];

	return new OpenApiGeneratorV3(registry.definitions).generateDocument({
		openapi: "3.0.3",
		info: { title: "base-backend", version: "1.0.0", description: "API documentation" },
		servers: [{ url: API_PREFIX, description: "API v1" }],
		tags: tags.map((name) => ({ name })),
	});
};
