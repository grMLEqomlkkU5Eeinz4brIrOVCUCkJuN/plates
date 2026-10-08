import {
	OpenAPIRegistry,
	OpenApiGeneratorV3,
	type RouteConfig,
} from "@asteasolutions/zod-to-openapi";
import { type ApiRoute, describedRoutes, errorBodySchema } from "./registry";

export const API_PREFIX = "/api/v1";

const SESSION = "sessionCookie";
const REFRESH = "refreshCookie";
const CSRF = "csrfHeader";

/** `/users/:id` -> `/users/{id}`. */
const toOpenApiPath = (path: string): string =>
	path.replace(/:(\w+)/g, "{$1}");

const securityOf = (route: ApiRoute): RouteConfig["security"] => {
	if (route.access === "open") return undefined;
	const requirement = { [route.access === "session" ? SESSION : REFRESH]: [] };
	return [route.csrf ? { ...requirement, [CSRF]: [] } : requirement];
};

const responsesOf = (route: ApiRoute): RouteConfig["responses"] =>
	Object.fromEntries(
		Object.entries(route.responses).map(([status, response]) => {
			if (typeof response === "string") {
				return [
					status,
					{
						description: response,
						content: { "application/json": { schema: errorBodySchema } },
					},
				];
			}
			return [
				status,
				{
					description: response.description,
					...(response.schema && {
						content: { "application/json": { schema: response.schema } },
					}),
				},
			];
		})
	);

const requestOf = (route: ApiRoute): RouteConfig["request"] => {
	if (!route.request) return undefined;
	const { params, query, body } = route.request;
	return {
		...(params && { params }),
		...(query && { query }),
		...(body && {
			body: { required: true, content: { "application/json": { schema: body } } },
		}),
	};
};

/**
 * The title is the SERVICE_NAME default rather than env.SERVICE_NAME, so that
 * openapi.json renders the same everywhere and the generator needs no secrets.
 */
export const buildOpenApiDocument = (): ReturnType<
	OpenApiGeneratorV3["generateDocument"]
> => {
	const registry = new OpenAPIRegistry();

	registry.registerComponent("securitySchemes", SESSION, {
		type: "apiKey",
		in: "cookie",
		name: "access_token",
		description: "Set by login and refresh. HttpOnly.",
	});
	registry.registerComponent("securitySchemes", REFRESH, {
		type: "apiKey",
		in: "cookie",
		name: "refresh_token",
		description: "Set by login and refresh. HttpOnly, sent only to /auth/refresh.",
	});
	registry.registerComponent("securitySchemes", CSRF, {
		type: "apiKey",
		in: "header",
		name: "x-csrf-token",
		description:
			"The csrfToken from login, refresh or /auth/csrf-token, bound to the current access_token cookie. That cookie outlives the token inside it, so refresh can still check the binding.",
	});

	const tags: string[] = [];

	for (const route of describedRoutes()) {
		for (const tag of route.tags) if (!tags.includes(tag)) tags.push(tag);

		registry.registerPath({
			method: route.method,
			path: toOpenApiPath(route.path),
			operationId: route.operationId,
			summary: route.summary,
			description: route.description,
			tags: [...route.tags],
			security: securityOf(route),
			request: requestOf(route),
			responses: responsesOf(route),
		});
	}

	return new OpenApiGeneratorV3(registry.definitions).generateDocument({
		openapi: "3.0.3",
		info: {
			title: "jwt-backend",
			version: "1.0.0",
			description: "API documentation",
		},
		servers: [{ url: API_PREFIX, description: "API v1" }],
		tags: tags.map((name) => ({ name })),
	});
};
