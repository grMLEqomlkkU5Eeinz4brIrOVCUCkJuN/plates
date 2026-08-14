import * as grpc from "@grpc/grpc-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { logger } from "../../lib/logger";
import { createTestDatabase } from "../../test/db";
import { PostServiceClient } from "../proto";
import { createGrpcServer, startGrpcServer } from "../server";

/**
 * A real gRPC server on a real (ephemeral) port, called by a real gRPC client.
 * Nothing is mocked - if the proto and the handlers disagree, this fails.
 */
interface WirePost {
	id: string;
	title: string;
	body: string;
	published: boolean;
	created_at: string;
	updated_at: string;
}

type Client = grpc.Client & Record<string, (...args: unknown[]) => unknown>;

function call<T>(client: Client, method: string, request: unknown): Promise<T> {
	return new Promise((resolve, reject) => {
		client[method]?.(request, (error: grpc.ServiceError | null, reply: T) =>
			error ? reject(error) : resolve(reply),
		);
	});
}

describe("grpc PostService", () => {
	let server: grpc.Server;
	let client: Client;

	beforeEach(async () => {
		server = createGrpcServer({ db: await createTestDatabase(), log: logger });

		const port = await startGrpcServer(server, 0);

		client = new PostServiceClient(
			`127.0.0.1:${port}`,
			grpc.credentials.createInsecure(),
		) as Client;
	});

	afterEach(() => {
		client.close();
		server.forceShutdown();
	});

	it("creates and lists posts", async () => {
		const created = await call<WirePost>(client, "CreatePost", {
			title: "Over gRPC",
			body: "hello",
		});

		expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
		expect(created.published).toBe(false);
		// Dates go over the wire as RFC 3339 strings, not Date objects.
		expect(created.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

		const { posts } = await call<{ posts: WirePost[] }>(client, "ListPosts", {});

		expect(posts.map((p) => p.title)).toEqual(["Over gRPC"]);
	});

	it("filters with published_only", async () => {
		await call(client, "CreatePost", { title: "Draft", body: "x" });
		await call(client, "CreatePost", { title: "Live", body: "y", published: true });

		const { posts } = await call<{ posts: WirePost[] }>(client, "ListPosts", {
			published_only: true,
		});

		expect(posts.map((p) => p.title)).toEqual(["Live"]);
	});

	it("leaves omitted fields alone on update", async () => {
		const created = await call<WirePost>(client, "CreatePost", {
			title: "Before",
			body: "keep me",
		});

		const updated = await call<WirePost>(client, "UpdatePost", {
			id: created.id,
			title: "After",
		});

		expect(updated.title).toBe("After");
		expect(updated.body).toBe("keep me");
	});

	it("deletes", async () => {
		const created = await call<WirePost>(client, "CreatePost", { title: "Doomed", body: "x" });

		await expect(call(client, "DeletePost", { id: created.id })).resolves.toEqual({
			id: created.id,
		});
	});

	it("maps a missing row to NOT_FOUND", async () => {
		const missing = call(client, "GetPost", { id: "00000000-0000-4000-8000-000000000000" });

		await expect(missing).rejects.toMatchObject({ code: grpc.status.NOT_FOUND });
	});

	it("maps a validation failure to INVALID_ARGUMENT", async () => {
		// protobuf is happy with an empty string - the service's arktype schema is not.
		const invalid = call(client, "CreatePost", { title: "", body: "x" });

		await expect(invalid).rejects.toMatchObject({ code: grpc.status.INVALID_ARGUMENT });
	});
});
