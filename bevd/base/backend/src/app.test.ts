import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createDatabase } from "./db";
import { createTestDatabase } from "./test/db";

/**
 * These go through the real Elysia instance with `app.handle()` - no port is bound.
 */
describe("app", () => {
	let app: ReturnType<typeof createApp>;

	beforeEach(async () => {
		app = createApp({ db: await createTestDatabase() });
	});

	it("serves the REST health route", async () => {
		const response = await app.handle(new Request("http://localhost/health"));

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({ status: "ok" });
	});

	it("serves a tRPC query over HTTP", async () => {
		const response = await app.handle(new Request("http://localhost/trpc/health.ping"));

		expect(response.status).toBe(200);

		const body = (await response.json()) as { result: { data: { status: string } } };
		expect(body.result.data.status).toBe("ok");
	});

	it("serves a tRPC mutation over HTTP, body intact", async () => {
		// This is what proves Elysia handed tRPC an unconsumed request body.
		const response = await app.handle(
			new Request("http://localhost/trpc/post.create", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ title: "Over HTTP", body: "posted" }),
			}),
		);

		expect(response.status).toBe(200);

		const body = (await response.json()) as { result: { data: { title: string } } };
		expect(body.result.data.title).toBe("Over HTTP");
	});

	it("returns a tRPC error shape for invalid input", async () => {
		const response = await app.handle(
			new Request("http://localhost/trpc/post.create", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ title: "", body: "" }),
			}),
		);

		expect(response.status).toBe(400);

		const body = (await response.json()) as { error: { data: { code: string } } };
		expect(body.error.data.code).toBe("BAD_REQUEST");
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
		const { db } = createDatabase("postgres://nobody:hunter2@127.0.0.1:59999/nope");
		const broken = createApp({ db });

		const response = await broken.handle(
			new Request("http://localhost/trpc/post.create", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ title: "x", body: "y" }),
			}),
		);

		expect(response.status).toBe(500);

		const raw = await response.text();
		const body = JSON.parse(raw) as {
			error: { message: string; data: { code: string; requestId?: string; stack?: string } };
		};

		expect(body.error.data.code).toBe("INTERNAL_SERVER_ERROR");
		expect(body.error.message).toBe("Internal server error");

		// Nothing about the query, the connection, or where it broke.
		expect(body.error.data.stack).toBeUndefined();
		expect(raw).not.toMatch(/insert into|select|password|hunter2|59999|\.ts:\d+/i);

		// But the caller does get an id they can quote, which ties to the full server log.
		expect(body.error.data.requestId).toEqual(expect.any(String));
	});
});
