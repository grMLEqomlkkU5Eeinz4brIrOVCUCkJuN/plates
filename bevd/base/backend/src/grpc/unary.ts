import * as grpc from "@grpc/grpc-js";
import type { Database } from "../db";
import { AppError, type ErrorCode } from "../lib/errors";
import { type Logger, requestIdFrom } from "../lib/logger";
import type { ServiceCtx } from "../services/context";

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

/** What a handler module needs to build its handlers: the same two things the app gets. */
export interface GrpcDeps {
	db: Database;
	log: Logger;
}

/**
 * Turns a `(ctx, request)` function into a gRPC unary handler.
 *
 * This is the gRPC counterpart of tRPC's `observe` middleware plus `createContext`, and
 * it is the only place that knows how a gRPC call becomes a ServiceCtx: pick up the
 * request id, bind a logger to it, time the call, translate AppErrors into gRPC statuses,
 * log one line either way. The JWT template resolves the caller here too.
 */
export function unary<Request, Reply>(
	{ db, log: root }: GrpcDeps,
	method: string,
	handler: (ctx: ServiceCtx, request: Request) => Promise<Reply>,
) {
	return (
		call: grpc.ServerUnaryCall<Request, Reply>,
		callback: grpc.sendUnaryData<Reply>,
	): void => {
		const requestId = requestIdFrom(call.metadata.get("x-request-id")[0]?.toString());
		const log = root.child({ requestId, transport: "grpc", method });
		const startedAt = performance.now();
		const elapsed = () => Math.round(performance.now() - startedAt);

		handler({ db, log }, call.request)
			.then((reply) => {
				log.info({ durationMs: elapsed() }, "grpc ok");
				callback(null, reply);
			})
			.catch((error: unknown) => {
				callback(toServiceError(error, log, elapsed()), null);
			});
	};
}
