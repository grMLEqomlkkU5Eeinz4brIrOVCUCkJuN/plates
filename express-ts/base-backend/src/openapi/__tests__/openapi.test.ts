import { readFileSync } from "fs";
import { describe, expect, it } from "@jest/globals";
import express, { Router } from "express";
import request from "supertest";
import { z } from "zod";
import routes from "../../routes";
import v1Router from "../../routes/api/v1";
import healthRoutes from "../../routes/api/v1/health.routes";
import userRoutes from "../../routes/api/v1/user.routes";
import type { ValidationSchema } from "../../middleware/validate";
import { openApiPath, renderedOpenApi } from "../../scripts/openapi";
import { API_PREFIX } from "../document";
import { describedRoutes } from "../index";
import { responseCheck, responseViolations } from "../responseCheck";

interface Layer {
	handle: { stack?: Layer[]; schema?: ValidationSchema };
	route?: { path: string; methods: Record<string, boolean>; stack: Layer[] };
}

// Express 5 does not keep a router's mount path on its layer, so every router
// is listed here with its full prefix. The coverage test fails when a router
// is mounted that this list does not name.
const mounts: [Router, string][] = [
	[routes, ""],
	[v1Router, "/api/v1"],
	[healthRoutes, "/api/v1/health"],
	[userRoutes, "/api/v1/users"],
];

const stackOf = (router: Router): Layer[] => (router as unknown as { stack: Layer[] }).stack;

const mountedRoutes = (): Map<string, Layer[]> => {
	const found = new Map<string, Layer[]>();
	for (const [router, prefix] of mounts) {
		for (const layer of stackOf(router)) {
			if (!layer.route) continue;
			const path = `${prefix}${layer.route.path}`.replace(/\/$/, "");
			for (const method of Object.keys(layer.route.methods)) {
				if (method === "_all") continue;
				found.set(`${method.toUpperCase()} ${path}`, layer.route.stack);
			}
		}
	}
	return found;
};

const describedKey = (route: { method: string; path: string }): string =>
	`${route.method.toUpperCase()} ${API_PREFIX}${route.path}`;

/** Every zod schema reachable from `schema`, itself included. */
const reachable = (schema: z.ZodType): z.ZodType[] => {
	const def = schema._zod.def as unknown as Record<string, unknown>;
	const children: unknown[] = [
		def.innerType,
		def.element,
		def.in,
		def.out,
		def.left,
		def.right,
		...(Array.isArray(def.options) ? def.options : []),
		...(schema instanceof z.ZodObject ? Object.values(schema.shape) : []),
	];
	return [
		schema,
		...children
			.filter((child): child is z.ZodType => child instanceof z.ZodType)
			.flatMap(reachable),
	];
};

const hasRefinement = (schema: z.ZodType): boolean =>
	(schema._zod.def.checks ?? []).some((check) => check._zod.def.check === "custom");

/** Schemas that carry a .refine() but no description to document it with. */
const undocumentedRefinements = (schema: z.ZodType, document: string): z.ZodType[] =>
	reachable(schema).filter(
		(node) => hasRefinement(node) && !(node.description && document.includes(node.description))
	);

describe("openapi description", () => {
	it("describes exactly the mounted routes", () => {
		const routers = new Set<unknown>();
		const collect = (router: Router): void => {
			routers.add(router);
			for (const layer of stackOf(router)) {
				if (layer.handle.stack) collect(layer.handle as unknown as Router);
			}
		};
		collect(routes);
		expect(routers).toEqual(new Set(mounts.map(([router]) => router)));

		const mounted = [...mountedRoutes().keys()].sort();
		expect(mounted.length).toBeGreaterThanOrEqual(6);
		expect(describedRoutes().map(describedKey).sort()).toEqual(mounted);
	});

	it("gives every route its own operationId", () => {
		const ids = describedRoutes().map((route) => route.operationId);
		expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
	});

	it("documents the schemas the validators run", () => {
		const mounted = mountedRoutes();
		for (const route of describedRoutes()) {
			const validated: ValidationSchema =
				mounted.get(describedKey(route))?.find((layer) => layer.handle.schema)?.handle.schema ?? {};
			expect(route.request?.params).toBe(validated.params);
			expect(route.request?.query).toBe(validated.query);
			expect(route.request?.body).toBe(validated.body);
		}
	});

	it("documents every refinement of a request schema", () => {
		for (const route of describedRoutes()) {
			const { params, query, body } = route.request ?? {};
			for (const schema of [params, query, body]) {
				if (schema) expect(undocumentedRefinements(schema, renderedOpenApi)).toEqual([]);
			}
		}
	});

	it("finds a refinement nested in an object", () => {
		const refined = z.string().refine((value) => value !== "root");
		const schema = z.object({ name: z.optional(refined) });

		expect(undocumentedRefinements(schema, renderedOpenApi)).toEqual([refined]);
	});

	it("matches the committed openapi.json", () => {
		const onDisk = readFileSync(openApiPath, "utf8").replace(/\r\n/g, "\n");
		expect(onDisk).toBe(renderedOpenApi);
	});
});

describe("responseCheck", () => {
	const app = express();
	const router = Router();
	router.get("/:id", (_req, res) => {
		res.json({ id: "not-a-uuid", name: "" });
	});
	router.get("/:id/extra", (_req, res) => {
		res.json({});
	});
	app.use(responseCheck);
	app.use("/api/v1/users", router);

	it("records a body that does not match the description", async () => {
		await request(app).get("/api/v1/users/00000000-0000-0000-0000-000000000000");

		const violations = responseViolations.splice(0);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toMatchObject({ route: "GET /users/:id", status: 200 });
		expect(violations[0]!.problem).toContain("email");
	});

	it("records a route with no description", async () => {
		await request(app).get("/api/v1/users/00000000-0000-0000-0000-000000000000/extra");

		expect(responseViolations.splice(0)).toEqual([
			{ route: "GET /users/:id/extra", status: 200, problem: "The route is not described." },
		]);
	});
});
