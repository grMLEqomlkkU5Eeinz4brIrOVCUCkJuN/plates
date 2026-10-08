import {
	OpenAPIRegistry,
	OpenApiGeneratorV3,
	type RouteConfig,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { type ApiRoute, describedRoutes, named } from "./registry";

export const API_PREFIX = "/api/v1";

/** What errorHandler sends for every failure, thrown or validation. */
export const errorBodySchema = named(
	"Error",
	z.strictObject({
		success: z.literal(false),
		message: z.string(),
		stack: z
			.string()
			.optional()
			.openapi({ description: "Sent only when NODE_ENV is development." }),
	})
);

/**
 * Names match middleware/auth.ts and middleware/csrf.ts; openapi.test.ts holds
 * the cookie names to the constants there.
 */
const securitySchemes = {
	accessCookie: {
		type: "apiKey",
		in: "cookie",
		name: "access_token",
		description: "Set by login and refresh. Read before the bearer header.",
	},
	bearerAuth: {
		type: "http",
		scheme: "bearer",
		bearerFormat: "JWT",
		description:
			"The access token, for clients that do not keep cookies. Strict RFC 6750: exactly one `Bearer <token>`.",
	},
	refreshCookie: {
		type: "apiKey",
		in: "cookie",
		name: "refresh_token",
		description: "Set by login and refresh, scoped to the refresh path.",
	},
	csrfToken: {
		type: "apiKey",
		in: "header",
		name: "x-csrf-token",
		description:
			"The csrfToken from login, refresh or /auth/csrf-token. It must match the __csrf cookie and the session it was minted for.",
	},
} as const;

const security = (route: ApiRoute): RouteConfig["security"] => {
	const csrf: Record<string, string[]> = route.csrf ? { csrfToken: [] } : {};
	switch (route.access) {
		case "bearer":
			return [
				{ accessCookie: [], ...csrf },
				{ bearerAuth: [], ...csrf },
			];
		case "refresh":
			return [{ refreshCookie: [], ...csrf }];
		case "open":
			return route.csrf ? [csrf] : undefined;
	}
};

type JsonContent = { "application/json": { schema: z.ZodType } };

const json = (schema: z.ZodType): JsonContent => ({
	"application/json": { schema },
});

const responses = (route: ApiRoute): RouteConfig["responses"] =>
	Object.fromEntries(
		Object.entries(route.responses).map(([status, response]) => {
			if (typeof response === "string") {
				return [
					status,
					{ description: response, content: json(errorBodySchema) },
				];
			}
			const schema =
				response.schema ??
				(Number(status) >= 400 ? errorBodySchema : undefined);
			return [
				status,
				{
					description: response.description,
					...(schema && { content: json(schema) }),
				},
			];
		})
	);

/** `/users/:id` -> `/users/{id}` */
const openApiPath = (path: string): string =>
	path.replace(/:(\w+)/g, "{$1}");

export const buildOpenApiDocument = (): ReturnType<
	OpenApiGeneratorV3["generateDocument"]
> => {
	const registry = new OpenAPIRegistry();

	for (const [name, scheme] of Object.entries(securitySchemes)) {
		registry.registerComponent("securitySchemes", name, scheme);
	}

	const tags: string[] = [];
	for (const route of describedRoutes()) {
		for (const tag of route.tags) if (!tags.includes(tag)) tags.push(tag);

		registry.registerPath({
			method: route.method,
			path: openApiPath(route.path),
			operationId: route.operationId,
			summary: route.summary,
			description: route.description,
			tags: [...route.tags],
			security: security(route),
			request: {
				params: route.request?.params,
				query: route.request?.query,
				body: route.request?.body
					? { required: true, content: json(route.request.body) }
					: undefined,
			},
			responses: responses(route),
		});
	}

	return new OpenApiGeneratorV3(registry.definitions).generateDocument({
		openapi: "3.0.3",
		info: {
			title: "lacewing-backend",
			version: "1.0.0",
			description:
				"Express + TypeScript backend demonstrating lacewing, the RFC 8725-first JWT library.",
		},
		servers: [{ url: API_PREFIX, description: "API v1" }],
		tags: tags.map((name) => ({ name })),
	});
};
