import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";
import type { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/auth";
import { doubleCsrfProtection } from "../../middleware/csrf";
import rootRouter from "../../routes";
import v1Router from "../../routes/api/v1";
import authRoutes from "../../routes/api/v1/auth.routes";
import healthRoutes from "../../routes/api/v1/health.routes";
import userRoutes from "../../routes/api/v1/user.routes";
import { OPENAPI_PATH, renderOpenApi } from "../../scripts/openapi";
import { describedRoutes } from "../index";
import type { ApiRoute } from "../registry";

/**
 * Every router mounted under /api/v1, by hand. The walk below fails on a mount
 * missing from this list, so a new router cannot go undescribed unnoticed.
 */
const mounts: [string, Router][] = [
	["/health", healthRoutes],
	["/auth", authRoutes],
	["/users", userRoutes],
];

interface MountedRoute {
	key: string;
	handlers: Router["stack"][number]["handle"][];
}

const walk = (): MountedRoute[] => {
	const routes: MountedRoute[] = [];

	for (const [prefix, router] of mounts) {
		for (const layer of router.stack) {
			if (!layer.route) {
				throw new Error(`${prefix} has a nested router or middleware the walk does not know`);
			}
			const path = `${prefix}${layer.route.path === "/" ? "" : layer.route.path}`;
			const methods = new Set(layer.route.stack.map((l) => l.method));
			for (const method of methods) {
				routes.push({
					key: `${method.toUpperCase()} ${path}`,
					handlers: layer.route.stack.map((l) => l.handle),
				});
			}
		}
	}

	return routes;
};

const keyOf = (route: ApiRoute): string =>
	`${route.method.toUpperCase()} ${route.path}`;

const byKey = new Map(describedRoutes().map((r) => [keyOf(r), r]));
const mounted = walk();

/** Every schema in `schema` carrying a `.refine()`, with its description. */
const refinements = (
	schema: z.ZodType,
	at = "",
	found: { at: string; description?: string }[] = []
): { at: string; description?: string }[] => {
	const def = schema._zod.def as z.core.$ZodTypeDef & Record<string, unknown>;

	if (def.checks?.some((check) => check._zod.def.check === "custom")) {
		found.push({ at, description: z.globalRegistry.get(schema)?.description });
	}

	const children: [string, unknown][] = [];
	if (def.type === "object") children.push(...Object.entries(def.shape as object));
	if ("innerType" in def) children.push(["", def.innerType]);
	if (def.type === "array") children.push(["[]", def.element]);
	if (def.type === "pipe") children.push(["", def.in], ["", def.out]);

	for (const [name, child] of children) {
		refinements(child as z.ZodType, name ? `${at}.${name}` : at, found);
	}

	return found;
};

describe("openapi description", () => {
	it("mounts exactly the routers the walk lists", () => {
		expect(rootRouter.stack).toHaveLength(1);
		expect(rootRouter.stack[0]!.handle).toBe(v1Router);

		const nested = v1Router.stack.map((l) => l.handle);
		expect(nested).toEqual(mounts.map(([, router]) => router));
	});

	it("describes every mounted route and nothing else", () => {
		expect(mounted.length).toBeGreaterThanOrEqual(11);
		expect(new Set(mounted.map((r) => r.key))).toEqual(new Set(byKey.keys()));
	});

	it("gives every route its own operationId", () => {
		const ids = describedRoutes().map((r) => r.operationId);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("documents the very schemas each validator runs", () => {
		const mismatched: string[] = [];

		for (const { key, handlers } of mounted) {
			const validator = handlers.find((h) => "schemas" in h) as
				| { schemas: Record<string, unknown> }
				| undefined;
			const request = byKey.get(key)!.request ?? {};

			for (const part of ["params", "query", "body"] as const) {
				if (request[part] !== validator?.schemas[part]) mismatched.push(`${key} ${part}`);
			}
		}

		expect(mismatched).toEqual([]);
	});

	it("finds a refinement and its description", () => {
		const schema = z.object({
			code: z.string().refine((v) => v.length === 6).describe("Six characters."),
		});
		expect(refinements(schema)).toEqual([{ at: ".code", description: "Six characters." }]);
	});

	it("documents every refinement on a request schema", () => {
		const document = renderOpenApi();
		const undocumented: string[] = [];

		for (const route of describedRoutes()) {
			for (const schema of Object.values(route.request ?? {})) {
				for (const { at, description } of refinements(schema)) {
					const inDocument =
						description !== undefined &&
						document.includes(JSON.stringify(description).slice(1, -1));
					if (!inDocument) undocumented.push(`${keyOf(route)} ${at}`);
				}
			}
		}

		expect(undocumented).toEqual([]);
	});

	it("describes as signed in exactly the routes that run authenticate", () => {
		const authenticated = mounted
			.filter((r) => r.handlers.includes(authenticate))
			.map((r) => r.key);
		const session = describedRoutes()
			.filter((r) => r.access === "session")
			.map(keyOf);

		expect(new Set(session)).toEqual(new Set(authenticated));
	});

	it("describes as needing a CSRF token exactly the routes that check one", () => {
		const checked = mounted
			.filter((r) => r.handlers.includes(doubleCsrfProtection))
			.map((r) => r.key);
		const csrf = describedRoutes()
			.filter((r) => r.csrf)
			.map(keyOf);

		expect(new Set(csrf)).toEqual(new Set(checked));
	});

	it("has openapi.json up to date (run npm run openapi)", () => {
		const onDisk = readFileSync(OPENAPI_PATH, "utf8").replace(/\r\n/g, "\n");
		expect(onDisk).toBe(renderOpenApi());
	});
});
