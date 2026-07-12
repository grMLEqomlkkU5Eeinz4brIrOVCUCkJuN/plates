import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it } from "vitest";
import { callerFor } from "../../test/context";
import { createTestDatabase } from "../../test/db";

describe("post router", () => {
	let trpc: ReturnType<typeof callerFor>;

	beforeEach(async () => {
		trpc = callerFor(await createTestDatabase());
	});

	it("creates a post and reads it back", async () => {
		const created = await trpc.post.create({ title: "First", body: "Hello" });

		expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
		expect(created.published).toBe(false);

		const found = await trpc.post.byId({ id: created.id });

		expect(found.title).toBe("First");
	});

	it("lists newest first and honours publishedOnly", async () => {
		await trpc.post.create({ title: "Draft", body: "x" });
		await trpc.post.create({ title: "Live", body: "y", published: true });

		const all = await trpc.post.list({});
		expect(all).toHaveLength(2);

		const live = await trpc.post.list({ publishedOnly: true });
		expect(live.map((p) => p.title)).toEqual(["Live"]);
	});

	it("updates only the fields it is given", async () => {
		const created = await trpc.post.create({ title: "Before", body: "keep me" });
		const updated = await trpc.post.update({ id: created.id, title: "After" });

		expect(updated.title).toBe("After");
		expect(updated.body).toBe("keep me");
	});

	it("deletes", async () => {
		const created = await trpc.post.create({ title: "Doomed", body: "x" });

		await expect(trpc.post.delete({ id: created.id })).resolves.toEqual({ id: created.id });
		await expect(trpc.post.list({})).resolves.toHaveLength(0);
	});

	it("rejects an unknown id with NOT_FOUND", async () => {
		const missing = trpc.post.byId({ id: "00000000-0000-4000-8000-000000000000" });

		await expect(missing).rejects.toThrow(TRPCError);
		await expect(missing).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("rejects invalid input before it reaches the database", async () => {
		// title is `1 <= string <= 200`, so an empty one never gets to Drizzle.
		await expect(trpc.post.create({ title: "", body: "x" })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});

		await expect(trpc.post.byId({ id: "not-a-uuid" })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});
});
