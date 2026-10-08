import { readFileSync } from "node:fs";
import { type Type, type } from "arktype";
import { Elysia } from "elysia";
import { describe, expect, it } from "vitest";
import { createApp } from "../../app";
import type { Database } from "../../db";
import { logger } from "../../lib/logger";
import { OPENAPI_PATH, renderOpenApiDocument } from "../../scripts/openapi";
import { toJson } from "../document";
import { buildOpenApiDocument, describedRoutes } from "../index";
import { responseCheck, UNDESCRIBED_ROUTES, violations } from "../responseCheck";

// Nothing here queries, so the app never touches the database it is handed.
const app = createApp({ db: {} as Database, log: logger });

const registered = app.routes.map((route) => `${route.method} ${route.path}`);
const described = describedRoutes().map((route) => `${route.method.toUpperCase()} ${route.path}`);

describe("OpenAPI description", () => {
	it("describes every route Elysia serves, and nothing it does not", () => {
		const served = registered.filter((key) => !UNDESCRIBED_ROUTES.has(key));

		// An empty walk would make the equality below pass vacuously.
		expect(served.length).toBeGreaterThanOrEqual(4);
		expect(new Set(served)).toEqual(new Set(described));

		// And the exemptions are all real, so a removed route cannot linger in the list.
		for (const exempt of UNDESCRIBED_ROUTES) expect(registered).toContain(exempt);
	});

	it("gives every operation its own operationId", () => {
		const ids = describedRoutes().map((route) => route.operationId);

		expect(new Set(ids).size).toBe(ids.length);
	});

	it("documents the very schema objects each route validates with", () => {
		for (const route of describedRoutes()) {
			const served = app.routes.find(
				(candidate) =>
					candidate.method === route.method.toUpperCase() &&
					candidate.path === route.path,
			);
			const hooks = served?.hooks as Partial<Record<"params" | "query" | "body", unknown>>;

			expect(hooks.params, `${route.operationId} params`).toBe(route.request?.params);
			expect(hooks.query, `${route.operationId} query`).toBe(route.request?.query);
			expect(hooks.body, `${route.operationId} body`).toBe(route.request?.body);
		}
	});

	it("states every request refinement in the document", () => {
		const document = JSON.stringify(buildOpenApiDocument());
		const refinements: (string | undefined)[] = [];

		for (const route of describedRoutes()) {
			const { params, query, body } = route.request ?? {};

			for (const schema of [params, query, body].filter((s): s is Type => s !== undefined)) {
				schema.toJsonSchema({
					fallback: {
						date: (ctx) => ctx.base,
						predicate: (ctx) => {
							refinements.push(ctx.base.description);
							return ctx.base;
						},
					},
				});
			}
		}

		for (const description of refinements) {
			expect(description).toEqual(expect.any(String));
			expect(document).toContain(JSON.stringify(description));
		}
	});

	it("refuses a .narrow() it cannot state", () => {
		const blank = type("string").narrow((s) => s.trim().length > 0);

		expect(() => toJson(type({ title: blank }), "probe")).toThrow(/no description/);
		expect(
			toJson(type({ title: blank.describe("not only whitespace") }), "probe"),
		).toMatchObject({ properties: { title: { description: "not only whitespace" } } });
	});

	it("declares no security, because this template has no authentication", () => {
		const document = buildOpenApiDocument() as { security?: unknown; components: object };

		expect(document.security).toBeUndefined();
		expect(document.components).not.toHaveProperty("securitySchemes");
	});

	it("matches the committed openapi.json (run `bun run openapi` if not)", () => {
		const onDisk = readFileSync(OPENAPI_PATH, "utf8").replace(/\r\n/g, "\n");

		expect(onDisk).toBe(renderOpenApiDocument());
	});

	it("serves that same document at /docs.json, and a UI at /docs", async () => {
		const json = await app.handle(new Request("http://localhost/docs.json"));
		expect(await json.json()).toEqual(JSON.parse(renderOpenApiDocument()));

		const page = await app.handle(new Request("http://localhost/docs"));
		expect(page.status).toBe(200);
		expect(page.headers.get("content-type")).toMatch(/text\/html/);
	});
});

describe("response check", () => {
	it("flags a body that disagrees with the description, naming the field", async () => {
		// Mounted at a described path, answering with a post that has no title.
		const liar = new Elysia().use(responseCheck).get("/api/v1/posts/:id", ({ params }) => ({
			id: params.id,
			body: "x",
			published: false,
			createdAt: new Date(),
			updatedAt: new Date(),
		}));

		await liar.handle(
			new Request("http://localhost/api/v1/posts/00000000-0000-4000-8000-000000000000"),
		);

		expect(violations.splice(0)).toEqual([
			expect.stringMatching(/^GET \/api\/v1\/posts\/:id 200: .*title/),
		]);
	});

	it("flags a route that is not described", async () => {
		const stray = new Elysia().use(responseCheck).get("/api/v1/stray", () => ({ ok: true }));

		await stray.handle(new Request("http://localhost/api/v1/stray"));

		expect(violations.splice(0)).toEqual([
			"GET /api/v1/stray answered 200 but is not described.",
		]);
	});
});
