import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createDatabase, type Database } from "../db";
import { ACCESS_COOKIE } from "../lib/cookies";
import { createTestDatabase } from "../test/db";

/**
 * The full HTTP path through Elysia with `app.handle()` - no port is bound. This is what
 * proves the browser's story works end to end: log in, get an httpOnly cookie back, and
 * have the next request authenticate with it.
 */
describe("app over http", () => {
	let app: ReturnType<typeof createApp>;
	let db: Database;

	beforeEach(async () => {
		db = await createTestDatabase();
		app = createApp({ db });
	});

	function trpc(procedure: string, body?: unknown, cookie?: string): Promise<Response> {
		const headers: Record<string, string> = { "content-type": "application/json" };

		if (cookie) headers.cookie = cookie;

		return app.handle(
			new Request(`http://localhost/trpc/${procedure}`, {
				method: body === undefined ? "GET" : "POST",
				headers,
				body: body === undefined ? undefined : JSON.stringify(body),
			}),
		);
	}

	async function registerAlice(): Promise<string> {
		const response = await trpc("auth.register", {
			email: "alice@example.com",
			name: "Alice",
			password: "password123",
		});

		expect(response.status).toBe(200);

		const setCookie = response.headers
			.getSetCookie()
			.find((cookie) => cookie.startsWith(`${ACCESS_COOKIE}=`));

		expect(setCookie).toBeDefined();

		// What a browser would send back on the next request.
		return setCookie?.split(";")[0] ?? "";
	}

	it("serves the REST health route", async () => {
		const response = await app.handle(new Request("http://localhost/health"));

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({ status: "ok" });
	});

	it("serves a tRPC query over HTTP", async () => {
		const response = await trpc("health.ping");

		expect(response.status).toBe(200);

		const body = (await response.json()) as { result: { data: { status: string } } };
		expect(body.result.data.status).toBe("ok");
	});

	it("rejects a protected mutation with no cookie", async () => {
		// This is also the mutation that proves Elysia handed tRPC an intact request body
		// rather than consuming it - a 401 means it parsed, a 500 would mean it did not.
		const response = await trpc("post.create", { title: "Nope", body: "x" });

		expect(response.status).toBe(401);

		const body = (await response.json()) as { error: { data: { code: string } } };
		expect(body.error.data.code).toBe("UNAUTHORIZED");
	});

	it("authenticates the next request with the cookie it just set", async () => {
		const cookie = await registerAlice();

		const created = await trpc("post.create", { title: "With cookie", body: "x" }, cookie);
		expect(created.status).toBe(200);

		const body = (await created.json()) as { result: { data: { title: string } } };
		expect(body.result.data.title).toBe("With cookie");
	});

	it("refuses a tampered cookie", async () => {
		const cookie = await registerAlice();
		const tampered = `${cookie.slice(0, -3)}aaa`;

		const response = await trpc("post.create", { title: "Nope", body: "x" }, tampered);

		expect(response.status).toBe(401);
	});

	it("echoes an inbound x-request-id, so a trace survives the hop", async () => {
		const response = await app.handle(
			new Request("http://localhost/trpc/health.ping", {
				headers: { "x-request-id": "from-the-gateway" },
			}),
		);

		expect(response.headers.get("x-request-id")).toBe("from-the-gateway");
	});

	it("never leaks internals when a query blows up", async () => {
		// A database that is not there. The driver throws a real error deep inside a
		// procedure, which is exactly the case that used to hand the client the failing
		// SQL, its parameters and a stack trace.
		const { db: missing } = createDatabase("postgres://nobody:hunter2@127.0.0.1:59999/nope");
		const broken = createApp({ db: missing });

		const response = await broken.handle(
			new Request("http://localhost/trpc/auth.login", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email: "alice@example.com", password: "password123" }),
			}),
		);

		expect(response.status).toBe(500);

		const raw = await response.text();
		const body = JSON.parse(raw) as {
			error: { message: string; data: { code: string; requestId?: string; stack?: string } };
		};

		expect(body.error.data.code).toBe("INTERNAL_SERVER_ERROR");
		expect(body.error.message).toBe("Internal server error");

		// Nothing about the query, the connection, the credentials, or where it broke.
		expect(body.error.data.stack).toBeUndefined();
		expect(raw).not.toMatch(/select|insert into|password|hunter2|59999|\.ts:\d+/i);

		// But the caller does get an id they can quote, which ties to the full server log.
		expect(body.error.data.requestId).toEqual(expect.any(String));
	});
});
