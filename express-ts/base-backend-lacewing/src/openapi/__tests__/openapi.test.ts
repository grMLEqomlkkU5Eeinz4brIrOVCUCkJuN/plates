import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";
import type { Router } from "express";
import { z } from "zod";
import {
	ACCESS_COOKIE,
	REFRESH_COOKIE,
	REFRESH_PATH,
	authenticate,
} from "../../middleware/auth";
import { doubleCsrfProtection } from "../../middleware/csrf";
import type { ValidationSchema } from "../../middleware/validate";
import routes from "../../routes";
import v1Router from "../../routes/api/v1";
import authRoutes from "../../routes/api/v1/auth.routes";
import healthRoutes from "../../routes/api/v1/health.routes";
import userRoutes from "../../routes/api/v1/user.routes";
import { openApiPath, renderOpenApi } from "../../scripts/generateOpenApi";
import { API_PREFIX } from "../document";
import { buildOpenApiDocument, describedRoutes } from "../index";
import type { ApiRoute } from "../registry";

/**
 * Every router mounted under the API prefix, by hand. Express 5 layers keep no
 * mount path to read back, so a new nested router has to be added here, and
 * the first test fails until it is.
 */
const mounts: readonly (readonly [string, Router])[] = [
	["/health", healthRoutes],
	["/auth", authRoutes],
	["/users", userRoutes],
];

// Layer.match exists at run time (the router package) but not in @types/express.
const mountedAt = (layer: unknown, path: string): boolean =>
	(layer as { match(path: string): boolean }).match(path);

const routerLayers = (router: Router): Router["stack"] =>
	router.stack.filter((layer) => !layer.route);

interface MountedRoute {
	key: string;
	handlers: unknown[];
}

const walk = (): MountedRoute[] => {
	const found: MountedRoute[] = [];
	for (const [prefix, router] of mounts) {
		for (const { route } of router.stack) {
			if (!route) continue;
			const path =
				API_PREFIX + prefix + (route.path === "/" ? "" : route.path);
			const handlers = route.stack.map((layer) => layer.handle);
			const methods = new Set(route.stack.map((layer) => layer.method));
			for (const method of methods) {
				found.push({ key: `${method.toUpperCase()} ${path}`, handlers });
			}
		}
	}
	return found;
};

const keyOf = (route: ApiRoute): string =>
	`${route.method.toUpperCase()} ${API_PREFIX}${route.path}`;

const mounted = new Map(walk().map((route) => [route.key, route]));

const handlersOf = (route: ApiRoute): unknown[] =>
	mounted.get(keyOf(route))?.handlers ?? [];

describe("openapi description", () => {
	it("describes every mounted route and no other", () => {
		const [v1Layer, ...otherTopLevel] = routerLayers(routes);
		expect(otherTopLevel).toEqual([]);
		expect(v1Layer?.handle).toBe(v1Router);
		expect(mountedAt(v1Layer, API_PREFIX)).toBe(true);

		const nested = routerLayers(v1Router);
		expect(nested.map((layer) => layer.handle)).toEqual(
			mounts.map(([, router]) => router)
		);
		mounts.forEach(([prefix], index) =>
			expect(mountedAt(nested[index], prefix)).toBe(true)
		);

		expect(mounted.size).toBeGreaterThanOrEqual(11);
		expect([...mounted.keys()].sort()).toEqual(
			describedRoutes().map(keyOf).sort()
		);
	});

	it("gives every route its own operationId", () => {
		const ids = describedRoutes().map((route) => route.operationId);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("documents the very schemas validate() runs", () => {
		for (const route of describedRoutes()) {
			const validator = handlersOf(route).find(
				(handler): handler is { schemas: ValidationSchema } =>
					typeof handler === "function" && "schemas" in handler
			);
			const runs = validator?.schemas ?? {};
			expect(route.request?.params).toBe(runs.params);
			expect(route.request?.query).toBe(runs.query);
			expect(route.request?.body).toBe(runs.body);
		}
	});

	it("puts every refinement's message in the document", () => {
		const document = JSON.stringify(buildOpenApiDocument());
		for (const route of describedRoutes()) {
			const { params, query, body } = route.request ?? {};
			for (const schema of [params, query, body]) {
				if (!schema) continue;
				for (const message of refinementMessages(schema)) {
					expect([keyOf(route), message]).toEqual([
						keyOf(route),
						expect.any(String),
					]);
					expect(document).toContain(message);
				}
			}
		}
	});

	it("finds refinements nested in a request schema", () => {
		const schema = z.object({
			outer: z.string().refine(() => true, "Outer must hold"),
			list: z
				.array(z.object({ inner: z.number() }).refine(() => true))
				.optional(),
		});
		expect(refinementMessages(schema)).toEqual(["Outer must hold", undefined]);
	});

	it("marks access the way the mounted middleware enforces it", () => {
		for (const route of describedRoutes()) {
			const handlers = handlersOf(route);
			expect([keyOf(route), route.access === "bearer"]).toEqual([
				keyOf(route),
				handlers.includes(authenticate),
			]);
			expect([keyOf(route), route.csrf === true]).toEqual([
				keyOf(route),
				handlers.includes(doubleCsrfProtection),
			]);
		}
		// The refresh cookie is path-scoped: only the route at that path sees it.
		const refresh = describedRoutes().filter(
			(route) => route.access === "refresh"
		);
		expect(refresh.map((route) => API_PREFIX + route.path)).toEqual([
			REFRESH_PATH,
		]);
	});

	it("names the cookies the auth middleware reads", () => {
		const schemes = buildOpenApiDocument().components?.securitySchemes;
		expect(schemes?.accessCookie).toMatchObject({
			in: "cookie",
			name: ACCESS_COOKIE,
		});
		expect(schemes?.refreshCookie).toMatchObject({
			in: "cookie",
			name: REFRESH_COOKIE,
		});
	});

	it("matches the committed openapi.json (npm run openapi rewrites it)", () => {
		const onDisk = readFileSync(openApiPath, "utf8").replace(/\r\n/g, "\n");
		expect(onDisk).toBe(renderOpenApi());
	});
});

/** The message of every .refine() in a schema, undefined where it has none. */
function refinementMessages(schema: z.core.$ZodType): (string | undefined)[] {
	const def = schema._zod.def;
	const own = (def.checks ?? [])
		.filter((check) => check._zod.def.check === "custom")
		.map((check) => {
			const message = check._zod.def.error?.({} as never);
			return typeof message === "string" ? message : undefined;
		});

	const children: z.core.$ZodType[] = [];
	switch (def.type) {
		case "object":
			children.push(...Object.values((def as z.core.$ZodObjectDef).shape));
			break;
		case "array":
			children.push((def as z.core.$ZodArrayDef).element);
			break;
		case "optional":
		case "nullable":
		case "default":
		case "readonly":
			children.push((def as z.core.$ZodOptionalDef).innerType);
			break;
		case "pipe":
			children.push(
				(def as z.core.$ZodPipeDef).in,
				(def as z.core.$ZodPipeDef).out
			);
			break;
		case "union":
			children.push(...(def as z.core.$ZodUnionDef).options);
			break;
	}
	return [...own, ...children.flatMap(refinementMessages)];
}
