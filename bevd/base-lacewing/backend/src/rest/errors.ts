import { Elysia, ValidationError } from "elysia";
import { requestContext } from "../http/request";
import { AppError, type ErrorCode } from "../lib/errors";
import { type Logger, requestIdFrom } from "../lib/logger";
import type { ErrorBody } from "../openapi/schemas";

/** The same statuses tRPC answers with for the same AppError, so the two never disagree. */
export const HTTP_STATUS: Record<ErrorCode, number> = {
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	CONFLICT: 409,
	INTERNAL: 500,
};

/**
 * One error body for every REST failure, `{ error: { code, message, requestId } }`. An
 * AppError keeps its message and gets its status; a failed validation is a 400, as under
 * tRPC (Elysia's own default is 422); anything else is a bug, logged with its stack, and
 * the caller gets a fixed string and the request id to quote - as trpc/trpc.ts does.
 *
 * Not named: it takes a logger, and Elysia dedupes named plugins, so a second app with a
 * different logger (a test) would silently get the first one's. Scoped, so it covers the
 * routes of the instance that uses it and leaves /health and the tRPC mount alone.
 */
export function restErrors(root: Logger) {
	return new Elysia()
		.use(requestContext)
		.onError({ as: "scoped" }, (context): typeof ErrorBody.infer => {
			const { code, error, set, path, request } = context;
			// Undefined when the body could not even be parsed: that fails before any
			// derive has run.
			const requestId =
				context.requestId ?? requestIdFrom(request.headers.get("x-request-id"));
			const log = root.child({ requestId, transport: "rest" });

			set.headers["x-request-id"] = requestId;

			if (error instanceof AppError) {
				log.info({ path, code: error.code }, "rest rejected");
				set.status = HTTP_STATUS[error.code];

				return { error: { code: error.code, message: error.message, requestId } };
			}

			if (error instanceof ValidationError || code === "PARSE") {
				log.info({ path, code }, "rest rejected");
				set.status = 400;

				// arktype's own messages, one per line: the same lines parseInput puts in the
				// AppError when tRPC or gRPC hands a service a bad input.
				const message =
					error instanceof ValidationError
						? error.all.map((issue) => issue.message).join("\n")
						: "Malformed request body";

				return { error: { code: "BAD_REQUEST", message, requestId } };
			}

			log.error({ path, err: error }, "rest failed");
			set.status = 500;

			return { error: { code: "INTERNAL", message: "Internal server error", requestId } };
		});
}
