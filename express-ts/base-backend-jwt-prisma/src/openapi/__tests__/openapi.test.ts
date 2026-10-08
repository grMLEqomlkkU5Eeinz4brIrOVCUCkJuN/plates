import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";
import type { Router } from "express";
import { z } from "zod";
import v1Router from "../../routes/api/v1";
import authRoutes from "../../routes/api/v1/auth.routes";
import healthRoutes from "../../routes/api/v1/health.routes";
import userRoutes from "../../routes/api/v1/user.routes";
import { authenticate, ACCESS_COOKIE } from "../../middleware/auth";
import { doubleCsrfProtection } from "../../middleware/csrf";
import type { ValidatingHandler } from "../../middleware/validate";
import { OPENAPI_PATH, renderOpenApi } from "../../scripts/openapi";
import { buildOpenApiDocument, describedRoutes } from "..";
import { routeKey } from "../responseCheck";

interface Layer {
	handle: ((...args: never[]) => unknown) & { stack?: Layer[]; schemas?: ValidatingHandler["schemas"] };
	route?: { path: string; methods: Record<string, boolean>; stack: Layer[] };
}

interface WalkedRoute {
	key: string;
	authenticated: boolean;
	csrf: boolean;
	schemas: ValidatingHandler["schemas"];
}

// Express 5 no longer keeps a router's mount path on its layer, so the nested
// routers are named here. The walk below fails on any router it finds that is
// not in this list, which is what stops a new one slipping past.
const MOUNTED: ReadonlyArray<[string, Router]> = [
	["/health", healthRoutes],
	["/auth", authRoutes],
	["/users", userRoutes],
];

const walk = (): WalkedRoute[] => {
	const walked: WalkedRoute[] = [];
	const v1Layers = (v1Router as unknown as { stack: Layer[] }).stack;

	for (const layer of v1Layers) {
		const mount = MOUNTED.find(([, router]) => router === (layer.handle as unknown));
		if (!mount) throw new Error("A router is mounted under /api/v1 that the walk does not name.");

		const [prefix, router] = mount;
		let authenticated = false;

		for (const inner of (router as unknown as { stack: Layer[] }).stack) {
			if (!inner.route) {
				if (inner.handle.stack) throw new Error(`A router is nested inside ${prefix}.`);
				if (inner.handle === authenticate) authenticated = true;
				continue;
			}

			const handlers = inner.route.stack.map((routeLayer) => routeLayer.handle);
			const path = inner.route.path === "/" ? prefix : `${prefix}${inner.route.path}`;

			for (const method of Object.keys(inner.route.methods)) {
				walked.push({
					key: routeKey(method, path),
					authenticated: authenticated || handlers.includes(authenticate),
					csrf: handlers.includes(doubleCsrfProtection),
					schemas: handlers.find((handler) => handler.schemas)?.schemas ?? {},
				});
			}
		}
	}

	return walked;
};

const described = new Map(describedRoutes().map((route) => [routeKey(route.method, route.path), route]));

describe("OpenAPI description", () => {
	it("describes every mounted route and nothing else", () => {
		const keys = walk().map((route) => route.key);

		// Twelve today; a walk that finds next to nothing is a broken walk.
		expect(keys.length).toBeGreaterThanOrEqual(12);
		expect(new Set(keys).size).toBe(keys.length);
		expect([...keys].sort()).toEqual([...described.keys()].sort());
	});

	it("gives every route its own operationId", () => {
		const ids = describedRoutes().map((route) => route.operationId);

		expect(new Set(ids).size).toBe(ids.length);
	});

	it("documents the very schemas each route validates with", () => {
		for (const route of walk()) {
			const request = described.get(route.key)?.request ?? {};

			expect(request.params).toBe(route.schemas.params);
			expect(request.query).toBe(route.schemas.query);
			expect(request.body).toBe(route.schemas.body);
		}
	});

	it("documents every refinement on a request schema", () => {
		const document = JSON.stringify(buildOpenApiDocument());
		let refinements = 0;

		const visit = (schema: z.ZodType | undefined): void => {
			if (!schema) return;
			const def = schema._zod.def as z.core.$ZodTypeDef & {
				checks?: Array<{ _zod: { def: { check: string; error?: () => string } } }>;
				shape?: Record<string, z.ZodType>;
				innerType?: z.ZodType;
				in?: z.ZodType;
				out?: z.ZodType;
			};

			for (const check of def.checks ?? []) {
				if (check._zod.def.check !== "custom") continue;
				refinements += 1;

				const message = check._zod.def.error?.() ?? "";
				const description = schema.description ?? "";

				expect(message).not.toBe("");
				expect(description).toContain(message);
				expect(document).toContain(JSON.stringify(description).slice(1, -1));
			}

			Object.values(def.shape ?? {}).forEach(visit);
			[def.innerType, def.in, def.out].forEach(visit);
		};

		for (const route of describedRoutes()) {
			visit(route.request?.params);
			visit(route.request?.query);
			visit(route.request?.body);
		}

		// updateAccountSchema's "at least one field".
		expect(refinements).toBe(1);
	});

	it("marks exactly the routes without authenticate as reachable without a session", () => {
		const walked = walk();
		const anonymous = walked.filter((route) => !route.authenticated).map((route) => route.key);
		const describedAnonymous = describedRoutes()
			.filter((route) => route.access !== "session")
			.map((route) => routeKey(route.method, route.path));

		expect(anonymous.sort()).toEqual(describedAnonymous.sort());
		expect(
			describedRoutes()
				.filter((route) => route.access === "public")
				.map((route) => routeKey(route.method, route.path))
				.sort()
		).toEqual([
			"GET /auth/csrf-token",
			"POST /auth/login",
			"POST /auth/refresh",
			"POST /auth/register",
		]);
	});

	it("requires the CSRF header exactly where doubleCsrfProtection runs", () => {
		for (const route of walk()) {
			expect([route.key, described.get(route.key)?.csrf ?? false]).toEqual([route.key, route.csrf]);
		}
	});

	it("names the cookie authenticate reads", () => {
		const document = buildOpenApiDocument();

		expect(document.components?.securitySchemes?.cookieAuth).toMatchObject({ name: ACCESS_COOKIE });
	});

	it("matches the committed openapi.json (run `npm run openapi`)", () => {
		const onDisk = readFileSync(OPENAPI_PATH, "utf8").replace(/\r\n/g, "\n");

		expect(onDisk).toBe(renderOpenApi());
	});
});
