import { readFileSync } from "node:fs";
import type { AnyProcedure } from "@trpc/server";
import { type Type, type } from "arktype";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../../db";
import { createTestDatabase } from "../../test/db";
import { checkedApp } from "../../test/http";
import { appRouter } from "../../trpc/routers";
import { toSchemaObject } from "../document";
import { OPENAPI_PATH, renderOpenApi } from "../generate";
import { buildOpenApiDocument, describedRoutes } from "../index";
import { checkResponse, violations } from "../responseCheck";

/**
 * Registered routes that are deliberately not in the document. Each must still exist, so
 * this list cannot quietly go stale and start excusing a route that has been renamed.
 */
const NOT_DESCRIBED = [
	"OPTIONS /", // CORS preflight, from @elysiajs/cors
	"OPTIONS /*",
	"GET /docs", // the document itself
	"GET /docs.json",
	"ALL /trpc", // the tRPC mount; its procedures are RPC, not REST
	"ALL /trpc/*",
];

const key = (method: string, path: string) => `${method.toUpperCase()} ${path}`;

// Flat at run time, keyed "post.create", but typed as the nested router tree.
const procedures = appRouter._def.procedures as unknown as Record<string, AnyProcedure>;

describe("openapi description", () => {
	let db: Database;

	beforeEach(async () => {
		db = await createTestDatabase();
	});

	it("describes exactly the routes Elysia registered", () => {
		const { app } = checkedApp(db);
		const registered = app.routes.map((route) => key(route.method, route.path));

		for (const excused of NOT_DESCRIBED) expect(registered).toContain(excused);

		const served = registered.filter((route) => !NOT_DESCRIBED.includes(route)).sort();
		const described = describedRoutes()
			.map((route) => key(route.method, route.path))
			.sort();

		expect(served).toEqual(described);
		// An empty walk would make the comparison above pass vacuously.
		expect(served.length).toBeGreaterThanOrEqual(9);
	});

	it("gives every route its own operationId", () => {
		const ids = describedRoutes().map((route) => route.operationId);

		expect(new Set(ids).size).toBe(ids.length);
	});

	it("documents the very arktype objects the routes validate with", () => {
		const { app } = checkedApp(db);

		for (const route of describedRoutes()) {
			const served = app.routes.find(
				(candidate) =>
					key(candidate.method, candidate.path) === key(route.method, route.path),
			);
			const hooks = served?.hooks as { body?: Type; query?: Type; params?: Type } | undefined;

			expect(hooks?.body, `${route.operationId} body`).toBe(route.request?.body);
			expect(hooks?.query, `${route.operationId} query`).toBe(route.request?.query);
			expect(hooks?.params, `${route.operationId} params`).toBe(route.request?.params);
		}
	});

	it("validates each twin with its procedure's own input", () => {
		for (const route of describedRoutes()) {
			if (!route.procedure) continue;

			const procedure = procedures[route.procedure];
			expect(procedure, route.procedure).toBeDefined();

			const [input] = procedure?._def.inputs ?? [];

			expect(input, route.procedure).toBe(
				route.request?.body ?? route.request?.params ?? route.request?.query,
			);
		}
	});

	it("puts every refinement's description in the document", () => {
		const document = JSON.stringify(buildOpenApiDocument());
		const refinements: string[] = [];

		// arktype's own serialisation: a `.narrow()` is a `predicate` node, described by its
		// `meta`. There are none in the request schemas today; the walk is what makes the
		// first one that arrives prove itself.
		const walk = (node: unknown): void => {
			if (!node || typeof node !== "object") return;

			const { predicate } = node as { predicate?: { meta?: unknown }[] };

			for (const check of predicate ?? []) {
				expect(typeof check.meta, "a .narrow() without .describe()").toBe("string");
				refinements.push(check.meta as string);
			}

			for (const child of Object.values(node)) walk(child);
		};

		for (const route of describedRoutes()) {
			for (const schema of Object.values(route.request ?? {})) walk(schema.json);
		}

		for (const description of refinements) expect(document).toContain(description);
	});

	it("refuses to render a refinement nobody described", () => {
		const described = type("string")
			.narrow((value) => value.trim() === value)
			.describe("no leading or trailing spaces");
		const silent = type("string").narrow((value) => value.trim() === value);

		expect(toSchemaObject(described).description).toBe("no leading or trailing spaces");
		expect(() => toSchemaObject(silent)).toThrow(/describe/);
	});

	it("answers anonymous callers exactly as each route's access level says", async () => {
		// Every route, called with no credentials and an input that would not validate.
		// signedIn and refreshCookie routes must stop at 401 before reading the input, as
		// protectedProcedure does; every other route must get past auth to its own answer.
		const { call } = checkedApp(db);

		for (const route of describedRoutes()) {
			const path = route.path.replace(/:\w+/g, "not-a-uuid");
			const response = await call(route.method.toUpperCase(), path, {
				body: route.method === "get" ? undefined : {},
			});
			const expectSignedOut = route.access === "signedIn" || route.access === "refreshCookie";

			expect(response.status === 401, `${route.operationId} -> ${response.status}`).toBe(
				expectSignedOut,
			);
		}
	});

	it("serves at /docs.json exactly the document it commits", async () => {
		// @elysiajs/openapi merges its own inference into what it is given; with every path
		// excluded, nothing of its own may remain.
		const { handle } = checkedApp(db);
		const response = await handle(new Request("http://localhost/docs.json"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(JSON.parse(renderOpenApi()));
	});

	it("matches the committed openapi.json", () => {
		const committed = readFileSync(OPENAPI_PATH, "utf8").replace(/\r\n/g, "\n");

		// On failure: `bun run openapi` and commit the result.
		expect(committed).toBe(renderOpenApi());
	});
});

describe("response check", () => {
	it("flags a body that disagrees with the description", async () => {
		const request = new Request("http://localhost/api/v1/auth/me");

		await checkResponse(request, Response.json({ id: "nope" }, { status: 200 }));
		await checkResponse(request, Response.json({ error: "flat" }, { status: 401 }));
		await checkResponse(request, Response.json({}, { status: 418 }));
		await checkResponse(
			new Request("http://localhost/api/v1/nowhere"),
			new Response("", { status: 200 }),
		);

		const found = violations.splice(0);

		expect(found).toHaveLength(4);
		expect(found[0]).toMatch(/^GET \/api\/v1\/auth\/me -> 200: .*id must be a UUID/s);
		expect(found[1]).toMatch(/-> 401: error must be an object/);
		expect(found[2]).toMatch(/-> 418: status not in the description/);
		expect(found[3]).toMatch(/no route describes this/);
	});
});
