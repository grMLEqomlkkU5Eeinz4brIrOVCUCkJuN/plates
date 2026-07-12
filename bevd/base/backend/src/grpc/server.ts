import * as grpc from "@grpc/grpc-js";
import type { Database } from "../db";
import type { Post } from "../db/schema";
import { AppError, type ErrorCode } from "../lib/errors";
import { type Logger, logger, requestIdFrom } from "../lib/logger";
import { createPost, deletePost, getPost, listPosts, updatePost } from "../services/post.service";
import { postServiceDefinition } from "./proto";

const GRPC_CODE: Record<ErrorCode, grpc.status> = {
	BAD_REQUEST: grpc.status.INVALID_ARGUMENT,
	UNAUTHORIZED: grpc.status.UNAUTHENTICATED,
	FORBIDDEN: grpc.status.PERMISSION_DENIED,
	NOT_FOUND: grpc.status.NOT_FOUND,
	CONFLICT: grpc.status.ALREADY_EXISTS,
	INTERNAL: grpc.status.INTERNAL,
};

function serviceError(code: grpc.status, message: string): grpc.ServiceError {
	return Object.assign(new Error(message), {
		code,
		details: message,
		metadata: new grpc.Metadata(),
		name: "ServiceError",
	});
}

/**
 * The gRPC twin of the tRPC error middleware: one AppError, two transports - and the same
 * rule about what a caller is told. An AppError carries a message meant for the client;
 * anything else is a bug, gets logged with its stack, and goes out as a bare "Internal
 * error" rather than a Postgres error string.
 */
function toServiceError(error: unknown, log: Logger, durationMs: number): grpc.ServiceError {
	if (error instanceof AppError) {
		log.info({ durationMs, code: error.code }, "grpc rejected");

		return serviceError(GRPC_CODE[error.code], error.message);
	}

	log.error({ durationMs, err: error }, "grpc failed");

	return serviceError(grpc.status.INTERNAL, "Internal error");
}

/** Drizzle hands back Date objects; protobuf wants RFC 3339 strings. */
function toWire(post: Post) {
	return {
		id: post.id,
		title: post.title,
		body: post.body,
		published: post.published,
		created_at: post.createdAt.toISOString(),
		updated_at: post.updatedAt.toISOString(),
	};
}

/**
 * Adapts a service call into a gRPC unary handler: pick up the request id, time the call,
 * translate AppErrors into gRPC statuses, log one line either way.
 */
function unary<Request, Reply>(method: string, handler: (request: Request) => Promise<Reply>) {
	return (
		call: grpc.ServerUnaryCall<Request, Reply>,
		callback: grpc.sendUnaryData<Reply>,
	): void => {
		const requestId = requestIdFrom(call.metadata.get("x-request-id")[0]?.toString());
		const log = logger.child({ requestId, transport: "grpc", method });
		const startedAt = performance.now();
		const elapsed = () => Math.round(performance.now() - startedAt);

		handler(call.request)
			.then((reply) => {
				log.info({ durationMs: elapsed() }, "grpc ok");
				callback(null, reply);
			})
			.catch((error: unknown) => {
				callback(toServiceError(error, log, elapsed()), null);
			});
	};
}

interface ListPostsRequest {
	limit?: number;
	published_only?: boolean;
}

interface CreatePostRequest {
	title: string;
	body: string;
	published?: boolean;
}

interface UpdatePostRequest {
	id: string;
	title?: string;
	body?: string;
	published?: boolean;
}

export function createGrpcServer(db: Database): grpc.Server {
	const server = new grpc.Server();

	server.addService(postServiceDefinition, {
		ListPosts: unary("ListPosts", async (request: ListPostsRequest) => {
			// proto3 sends 0 for an unset int32, which is not a valid limit. The key is
			// spread in only when it is real, never set to undefined: to arktype an optional
			// key means *absent*, and `{ limit: undefined }` is a present key holding an
			// invalid value - it fails validation.
			const limit = request.limit && request.limit > 0 ? { limit: request.limit } : {};

			const rows = await listPosts(db, {
				...limit,
				publishedOnly: request.published_only ?? false,
			});

			return { posts: rows.map(toWire) };
		}),

		GetPost: unary("GetPost", async (request: { id: string }) =>
			toWire(await getPost(db, request)),
		),

		CreatePost: unary("CreatePost", async (request: CreatePostRequest) =>
			toWire(await createPost(db, request)),
		),

		UpdatePost: unary("UpdatePost", async (request: UpdatePostRequest) =>
			toWire(await updatePost(db, request)),
		),

		DeletePost: unary("DeletePost", (request: { id: string }) => deletePost(db, request)),
	});

	return server;
}

/** Binds the server. Pass port 0 to get a free one - that is what the tests do. */
export function startGrpcServer(server: grpc.Server, port: number): Promise<number> {
	return new Promise((resolve, reject) => {
		server.bindAsync(
			`0.0.0.0:${port}`,
			grpc.ServerCredentials.createInsecure(),
			(error, boundPort) => (error ? reject(error) : resolve(boundPort)),
		);
	});
}
