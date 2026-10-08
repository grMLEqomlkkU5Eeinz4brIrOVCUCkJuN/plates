import { type } from "arktype";
import { Elysia } from "elysia";
import { AppError, type ErrorCode } from "../lib/errors";
import { type Logger, requestIdFrom } from "../lib/logger";
import { requestContext } from "./request";

/** The same statuses tRPC answers with for the same AppError, so the two never disagree. */
const HTTP_STATUS: Record<ErrorCode, number> = {
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	CONFLICT: 409,
	INTERNAL: 500,
};

/** Every REST error answers with this, and the OpenAPI document says so. */
export const ErrorBody = type({
	"+": "reject",
	error: {
		"+": "reject",
		code: "'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL'",
		message: "string",
		requestId: "string",
	},
});

/**
 * The REST twin of tRPC's `observe` middleware and gRPC's `toServiceError`: an AppError
 * keeps its message and gets its status; a failed validation is a 400, as it is under tRPC
 * (Elysia's own default is 422); anything else is a bug, logged with its stack, and the
 * caller gets a fixed string and the request id to quote.
 *
 * Scoped, so it covers the routes of whichever instance uses it and nothing else: /health
 * and the tRPC mount keep the behaviour they had.
 */
export function restErrors(log: Logger) {
	return new Elysia({ name: "rest-errors" })
		.use(requestContext)
		.onError({ as: "scoped" }, (context): typeof ErrorBody.infer => {
			const { code, error, set, path, request } = context;
			// Undefined when the body could not even be parsed: that fails before the
			// derive in rest/request.ts runs.
			const requestId =
				context.requestId ?? requestIdFrom(request.headers.get("x-request-id"));
			// The app sets this in onAfterHandle, which an error skips.
			set.headers["x-request-id"] = requestId;

			if (error instanceof AppError) {
				log.info({ requestId, path, code: error.code }, "rest rejected");
				set.status = HTTP_STATUS[error.code];

				return { error: { code: error.code, message: error.message, requestId } };
			}

			if (code === "VALIDATION" || code === "PARSE") {
				log.info({ requestId, path, code }, "rest rejected");
				set.status = 400;

				// arktype's own messages, one per problem: the same lines parseInput puts in
				// the AppError when tRPC or gRPC hands the service a bad input.
				const message =
					code === "VALIDATION"
						? error.all.map((issue) => issue.message).join("\n")
						: "Malformed request body";

				return { error: { code: "BAD_REQUEST", message, requestId } };
			}

			log.error({ requestId, path, err: error }, "rest failed");
			set.status = 500;

			return { error: { code: "INTERNAL", message: "Internal server error", requestId } };
		});
}
