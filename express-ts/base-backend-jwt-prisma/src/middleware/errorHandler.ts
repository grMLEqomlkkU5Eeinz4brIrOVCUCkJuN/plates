import { Request, Response, NextFunction } from "express";
import createError, { HttpError } from "http-errors";
import { env } from "../config/env";
import logger from "../utils/logger";

export { HttpError };

/**
 * The codes clients branch on. The HTTP status says how to react in general,
 * the code says which failure it was, and the message is for a human reading
 * a log or a debug console. Adding a case here is how a new failure becomes
 * part of the contract; throwing a bare status is how it stays undocumented.
 */
export type ErrorCode =
	| "VALIDATION_ERROR"
	| "MALFORMED_BODY"
	| "PAYLOAD_TOO_LARGE"
	| "UNAUTHENTICATED"
	| "TOKEN_INVALID"
	| "TOKEN_EXPIRED"
	| "INVALID_CREDENTIALS"
	| "EMAIL_TAKEN"
	| "REFRESH_INVALID"
	| "REFRESH_REUSED"
	| "CSRF_INVALID"
	| "NOT_FOUND"
	| "RATE_LIMITED"
	| "DEPENDENCY_UNAVAILABLE"
	| "INTERNAL";

interface ErrorOptions {
	/**
	 * Not named `code`: Node puts its own errno strings there
	 * (ENOENT, ECONNREFUSED), csrf-csrf puts EBADCSRFTOKEN there, and this
	 * value is serialised to clients.
	 */
	errorCode: ErrorCode;
	/** Field-level detail for VALIDATION_ERROR. Never internals. */
	details?: unknown;
	/** Extra context for the log line only; never serialised to the client. */
	logContext?: Record<string, unknown>;
	/**
	 * http-errors hides the message of anything 5xx, on the assumption that
	 * it is a stack trace's first line. A 503 raised by this code, naming the
	 * dependency that is down, is written for the client and is safe to send.
	 */
	expose?: boolean;
}

interface TaggedError {
	errorCode?: ErrorCode;
	details?: unknown;
	logContext?: Record<string, unknown>;
	/** Node-style discriminant: csrf-csrf's EBADCSRFTOKEN. */
	code?: string;
	/** body-parser's discriminant: entity.too.large, entity.parse.failed, ... */
	type?: string;
}

export const httpError = (
	status: number,
	message: string,
	options: ErrorOptions
): HttpError => createError(status, message, options);

const codeOf = (err: TaggedError, status: number, isHttpError: boolean): ErrorCode => {
	if (err.errorCode) return err.errorCode;

	// Everything below is an error we did not raise ourselves. body-parser is
	// the one that arrives here routinely: a client sent 2 MB of JSON, or sent
	// something that is not JSON at all. csrf-csrf is the other.
	if (err.type === "entity.too.large") return "PAYLOAD_TOO_LARGE";
	if (err.type) return "MALFORMED_BODY";
	if (err.code === "EBADCSRFTOKEN") return "CSRF_INVALID";
	if (!isHttpError || status >= 500) return "INTERNAL";
	return status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR";
};

export const errorHandler = (
	err: Error,
	req: Request,
	res: Response,
	_next: NextFunction
): void => {
	// Duck-typed, not instanceof: body-parser hands the SyntaxError from
	// JSON.parse to createError, which decorates that error with a status
	// rather than constructing an HttpError, so an instanceof check would turn
	// "you sent something that is not JSON" into a 500.
	const isHttpError = createError.isHttpError(err);
	const statusCode = isHttpError ? err.statusCode : 500;

	// An HttpError we raised is a decision about what the client should see.
	// Anything else reached here uncaught, so it says nothing safe.
	const expose = isHttpError && err.expose;
	const tagged = err as Error & TaggedError;
	const code = codeOf(tagged, statusCode, isHttpError);

	logger.log(statusCode >= 500 ? "error" : "warn", err.message, {
		requestId: req.requestId,
		errorCode: code,
		statusCode,
		method: req.method,
		path: req.path,
		ip: req.ip,
		userId: req.auth?.userId,
		...tagged.logContext,
		...(statusCode >= 500 && { stack: err.stack }),
	});

	res.status(statusCode).json({
		success: false,
		code,
		message: expose ? err.message : "Internal server error",
		requestId: req.requestId,
		...(expose && tagged.details !== undefined && { details: tagged.details }),
		...(env.NODE_ENV === "development" && statusCode >= 500 && { stack: err.stack }),
	});
};

export const notFoundHandler = (
	req: Request,
	_res: Response,
	next: NextFunction
): void => {
	next(
		httpError(404, `Route not found: ${req.method} ${req.path}`, {
			errorCode: "NOT_FOUND",
		})
	);
};
