import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { type } from "arktype";
import { Elysia } from "elysia";
import { describe, expect, it } from "vitest";
import { createApp } from "../../app";
import type { Database } from "../../db";
import { logger } from "../../lib/logger";
import { OPENAPI_PATH, renderOpenApiDocument } from "../../scripts/openapi";
import { testApp } from "../../test/app";
import { createTestDatabase } from "../../test/db";
import { appRouter } from "../../trpc/routers";
import { RPC_ONLY_PROCEDURES, toJson } from "../document";
import { buildOpenApiDocument, describedRoutes } from "../index";
import { responseCheck, UNDESCRIBED_ROUTES, violations } from "../responseCheck";

// Nothing here queries, so the app never touches the database it is handed.
const app = createApp({ db: {} as Database, log: logger });

const registered = app.routes.map((route) => `${route.method} ${route.path}`);
const described = describedRoutes().map((route) => `${route.method.toUpperCase()} ${route.path}`);

type Procedure = { _def: { inputs: unknown[] } };
// Typed as the nested router, but held flat at run time, keyed "post.create".
const procedures = appRouter._def.procedures as unknown as Record<string, Procedure>;

describe("OpenAPI description", () => {
	it("describes every route Elysia serves, and nothing it does not", () => {
		const served = registered.filter((key) => !UNDESCRIBED_ROUTES.has(key));

		// An empty walk would make the equality below pass vacuously.
		expect(served.length).toBeGreaterThanOrEqual(7);
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

	it("validates each twin with the schema its tRPC procedure takes as .input()", () => {
		for (const route of describedRoutes().filter((r) => r.procedure)) {
			const procedure = procedures[route.procedure as string];
			const { params, query, body } = route.request ?? {};

			expect(procedure, route.procedure).toBeDefined();
			expect(procedure?._def.inputs, route.operationId).toEqual(
				[params ?? query ?? body].filter((schema) => schema !== undefined),
			);
			expect(procedure?._def.inputs[0], route.operationId).toBe(params ?? query ?? body);
		}
	});

	it("names as RPC-only exactly the procedures without a REST twin", () => {
		const mirrored = describedRoutes().flatMap((route) => route.procedure ?? []);

		expect(new Set([...mirrored, ...RPC_ONLY_PROCEDURES])).toEqual(
			new Set(Object.keys(procedures)),
		);
		expect(mirrored.length + RPC_ONLY_PROCEDURES.length).toBe(Object.keys(procedures).length);
	});

	it("states every request refinement in the document", () => {
		const document = JSON.stringify(buildOpenApiDocument());
		const refinements: (string | undefined)[] = [];

		for (const route of describedRoutes()) {
			const { params, query, body } = route.request ?? {};

			for (const schema of [params, query, body].filter(
				(s): s is type.Any => s !== undefined,
			)) {
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
		).toMatchObject({
			properties: { title: { description: "not only whitespace" } },
		});
	});

	it("matches the committed openapi.json (run `bun run openapi` if not)", () => {
		const onDisk = readFileSync(OPENAPI_PATH, "utf8").replace(/\r\n/g, "\n");

		expect(onDisk).toBe(renderOpenApiDocument());
	});

	it("renders with an empty environment, so no .env is needed to generate it", () => {
		// A fresh process, because this one already has vitest's env loaded. If anything on
		// the generator's import path reaches config/env, it throws here.
		const run = spawnSync(
			"bun",
			[
				"-e",
				'import { renderOpenApiDocument } from "./src/scripts/openapi"; process.stdout.write(renderOpenApiDocument());',
			],
			{
				cwd: new URL("../../..", import.meta.url).pathname,
				env: { PATH: process.env.PATH },
				encoding: "utf8",
			},
		);

		expect(run.stderr).toBe("");
		expect(run.stdout).toBe(readFileSync(OPENAPI_PATH, "utf8").replace(/\r\n/g, "\n"));
	});

	it("serves that same document at /docs.json, and a UI at /docs", async () => {
		const json = await app.handle(new Request("http://localhost/docs.json"));
		expect(await json.json()).toEqual(JSON.parse(renderOpenApiDocument()));

		const page = await app.handle(new Request("http://localhost/docs"));
		expect(page.status).toBe(200);
		expect(page.headers.get("content-type")).toMatch(/text\/html/);
	});
});

describe("access levels", () => {
	// A well-formed input per route, so the only thing an anonymous call can trip on is
	// the missing session. A route added without one fails here rather than passing by
	// sending nothing.
	const INPUT: Record<string, { path?: string; body?: unknown }> = {
		getHealth: {},
		login: { body: { email: "nobody@example.com", password: "whatever1" } },
		refreshSession: {},
		getMe: {},
		listPosts: {},
		getPost: { path: "/api/v1/posts/00000000-0000-4000-8000-000000000000" },
		createPost: { body: { title: "t", body: "b" } },
	};

	it("marks bearer exactly the routes that turn an anonymous caller away", async () => {
		const live = testApp(await createTestDatabase());
		const refusesAnonymous: string[] = [];
		const wantsRefreshCookie: string[] = [];

		for (const route of describedRoutes()) {
			const input = INPUT[route.operationId];
			expect(input, `no anonymous input for ${route.operationId}`).toBeDefined();

			const response = await live.handle(
				new Request(`http://localhost${input?.path ?? route.path}`, {
					method: route.method.toUpperCase(),
					headers: input?.body ? { "content-type": "application/json" } : {},
					body: input?.body ? JSON.stringify(input.body) : undefined,
				}),
			);

			if (response.status !== 401) continue;

			const { error } = (await response.json()) as { error: { message: string } };

			if (error.message === "You must be signed in") refusesAnonymous.push(route.operationId);
			if (error.message === "No refresh token") wantsRefreshCookie.push(route.operationId);
		}

		const byAccess = (access: string) =>
			describedRoutes()
				.filter((route) => route.access === access)
				.map((route) => route.operationId);

		expect(refusesAnonymous.sort()).toEqual(byAccess("bearer").sort());
		expect(wantsRefreshCookie).toEqual(byAccess("refresh"));
	}, 30_000);
});

describe("response check", () => {
	it("flags a body that disagrees with the description, naming the field", async () => {
		const liar = new Elysia().use(responseCheck).get("/api/v1/posts/:id", ({ params }) => ({
			id: params.id,
			body: "x",
			published: false,
			authorId: params.id,
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

	it("flags a user that leaks its password hash", async () => {
		const leaky = new Elysia().use(responseCheck).get("/api/v1/auth/me", () => ({
			id: "00000000-0000-4000-8000-000000000000",
			email: "alice@example.com",
			name: "Alice",
			role: "user",
			passwordHash: "$argon2id$...",
			createdAt: new Date(),
			updatedAt: new Date(),
		}));

		await leaky.handle(new Request("http://localhost/api/v1/auth/me"));

		expect(violations.splice(0)).toEqual([expect.stringMatching(/passwordHash/)]);
	});

	it("flags a route that is not described", async () => {
		const stray = new Elysia().use(responseCheck).get("/api/v1/stray", () => ({ ok: true }));

		await stray.handle(new Request("http://localhost/api/v1/stray"));

		expect(violations.splice(0)).toEqual([
			"GET /api/v1/stray answered 200 but is not described.",
		]);
	});
});
