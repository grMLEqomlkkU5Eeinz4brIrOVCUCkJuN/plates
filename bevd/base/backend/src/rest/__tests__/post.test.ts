import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { createDatabase } from "../../db";
import { logger } from "../../lib/logger";
import { createTestDatabase } from "../../test/db";

const json = (body: unknown): RequestInit => ({
	method: "POST",
	headers: { "content-type": "application/json" },
	body: JSON.stringify(body),
});

interface ErrorBody {
	error: { code: string; message: string; requestId: string };
}

describe("REST /api/v1/posts", () => {
	let app: ReturnType<typeof createApp>;

	const call = (path: string, init?: RequestInit) =>
		app.handle(new Request(`http://localhost/api/v1${path}`, init));

	beforeEach(async () => {
		app = createApp({ db: await createTestDatabase(), log: logger });
	});

	it("creates with 201 and reads the post back by id", async () => {
		const created = await call("/posts", json({ title: "Over REST", body: "hi" }));
		expect(created.status).toBe(201);

		const post = (await created.json()) as { id: string; published: boolean };
		expect(post.published).toBe(false);

		const found = await call(`/posts/${post.id}`);
		expect(found.status).toBe(200);
		await expect(found.json()).resolves.toMatchObject({ id: post.id, title: "Over REST" });
	});

	it("lists newest first, with limit and publishedOnly read from the query string", async () => {
		await call("/posts", json({ title: "Draft", body: "x" }));
		await call("/posts", json({ title: "Live one", body: "y", published: true }));
		await call("/posts", json({ title: "Live two", body: "z", published: true }));

		const all = (await (await call("/posts")).json()) as { title: string }[];
		expect(all.map((p) => p.title)).toEqual(["Live two", "Live one", "Draft"]);

		const live = (await (await call("/posts?publishedOnly=true&limit=1")).json()) as {
			title: string;
		}[];
		expect(live.map((p) => p.title)).toEqual(["Live two"]);

		const drafts = (await (await call("/posts?publishedOnly=false")).json()) as unknown[];
		expect(drafts).toHaveLength(3);
	});

	it.each([
		["a limit past the procedure's maximum", "/posts?limit=101"],
		["a limit of zero", "/posts?limit=0"],
		["a limit that is not a number", "/posts?limit=ten"],
		["publishedOnly that is not true or false", "/posts?publishedOnly=yes"],
	])("rejects %s with a 400, as tRPC does", async (_, path) => {
		const response = await call(path);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ error: { code: "BAD_REQUEST" } });
	});

	it("rejects an invalid body with a 400 and arktype's message", async () => {
		const response = await call("/posts", json({ title: "", body: "x" }));

		expect(response.status).toBe(400);

		const body = (await response.json()) as ErrorBody;
		expect(body.error.code).toBe("BAD_REQUEST");
		expect(body.error.message).toMatch(/title/);
	});

	it("rejects a body that is not JSON with a 400", async () => {
		const response = await call("/posts", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{not json",
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ error: { code: "BAD_REQUEST" } });
	});

	it("answers 400 for an id that is not a uuid and 404 for one that does not exist", async () => {
		expect((await call("/posts/not-a-uuid")).status).toBe(400);

		const missing = await call("/posts/00000000-0000-4000-8000-000000000000");
		expect(missing.status).toBe(404);
		await expect(missing.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });
	});

	it("quotes the same request id in the error body and the response header", async () => {
		const response = await call("/posts/00000000-0000-4000-8000-000000000000");
		const body = (await response.json()) as ErrorBody;

		expect(body.error.requestId).toEqual(expect.any(String));
		expect(response.headers.get("x-request-id")).toBe(body.error.requestId);
	});

	it("never leaks internals when the database is gone", async () => {
		const { db } = createDatabase("postgres://nobody:hunter2@127.0.0.1:59999/nope");
		const broken = createApp({ db, log: logger });

		const response = await broken.handle(
			new Request("http://localhost/api/v1/posts", json({ title: "x", body: "y" })),
		);

		expect(response.status).toBe(500);

		const raw = await response.text();
		expect(JSON.parse(raw)).toMatchObject({
			error: { code: "INTERNAL", message: "Internal server error" },
		});
		expect(raw).not.toMatch(/insert into|select|password|hunter2|59999|\.ts:\d+/i);
	});
});
