import { z } from "zod";
import {
	OpenAPIRegistry,
	OpenApiGeneratorV3,
	type RouteConfig,
} from "@asteasolutions/zod-to-openapi";
import { type ApiRoute, describedRoutes, errorBody, namedComponents } from "./registry";

const csrfHeader = z.object({
	"x-csrf-token": z.string().openapi({
		description: "The csrfToken from login, register, refresh or GET /auth/csrf-token.",
	}),
});

/** Express writes `/users/:id`; OpenAPI writes `/users/{id}`. */
export const toOpenApiPath = (path: string): string => path.replace(/:(\w+)/g, "{$1}");

const json = (schema: z.ZodType) => ({ content: { "application/json": { schema } } });

const toRouteConfig = (route: ApiRoute): RouteConfig => {
	const responses: RouteConfig["responses"] = {};

	for (const [status, response] of Object.entries(route.responses)) {
		if (typeof response === "string") {
			responses[status] = { description: response, ...json(errorBody) };
		} else {
			responses[status] = {
				description: response.description,
				...(response.schema && json(response.schema)),
			};
		}
	}

	return {
		method: route.method,
		path: toOpenApiPath(route.path),
		operationId: route.operationId,
		summary: route.summary,
		description: route.description,
		tags: [...route.tags],
		...(route.access === "session" && { security: [{ cookieAuth: [] }] }),
		request: {
			params: route.request?.params,
			query: route.request?.query,
			...(route.csrf && { headers: csrfHeader }),
			...(route.request?.body && {
				body: { required: true, ...json(route.request.body) },
			}),
		},
		responses,
	};
};

/** OpenAPI 3.0.3, built from every route the area files described. */
export const buildOpenApiDocument = (): ReturnType<OpenApiGeneratorV3["generateDocument"]> => {
	const registry = new OpenAPIRegistry();

	for (const [id, schema] of namedComponents()) registry.register(id, schema);
	registry.registerComponent("securitySchemes", "cookieAuth", {
		type: "apiKey",
		in: "cookie",
		// ACCESS_COOKIE in middleware/auth.ts, which reads the environment at
		// import; the generator runs without one. A test holds the two equal.
		name: "access_token",
	});
	for (const route of describedRoutes()) registry.registerPath(toRouteConfig(route));

	return new OpenApiGeneratorV3(registry.definitions).generateDocument({
		openapi: "3.0.3",
		info: {
			title: "jwt-prisma-backend",
			version: "1.0.0",
			description:
				"Errors are one shape everywhere: the Error schema. `code` is the value to branch on. Every session route can also answer 401 UNAUTHENTICATED, TOKEN_EXPIRED or TOKEN_INVALID, and every route with a body 400 MALFORMED_BODY or 413 PAYLOAD_TOO_LARGE.",
		},
		servers: [{ url: "/api/v1", description: "API v1" }],
	});
};
