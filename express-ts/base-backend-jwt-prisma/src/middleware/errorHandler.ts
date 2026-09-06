import { Request, Response, NextFunction } from "express";
import createError, { HttpError } from "http-errors";
import { env } from "../config/env";
import { Prisma } from "../generated/prisma/client";
import logger from "../utils/logger";

export { createError, HttpError };

/**
 * The Prisma errors that are a client's fault rather than the server's. Anything
 * not listed stays a 500, which is the honest answer for a connection failure or
 * a schema that does not match the database.
 *
 * The message is ours, not Prisma's: `err.message` carries the model name, the
 * failing constraint and often the offending value, and none of that belongs in
 * a response body. The original still reaches the log below.
 */
const PRISMA_ERRORS: Record<string, [status: number, message: string]> = {
	P2000: [400, "Value too long for the field"],
	P2002: [409, "A record with that value already exists"],
	P2003: [409, "Related record required"],
	P2011: [400, "Missing required field"],
	P2025: [404, "Record not found"],
};

const fromPrisma = (err: Error): HttpError | undefined => {
	if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return undefined;

	const mapped = PRISMA_ERRORS[err.code];

	return mapped ? createError(mapped[0], mapped[1]) : undefined;
};

export const errorHandler = (
	err: Error,
	req: Request,
	res: Response,
	_next: NextFunction
): void => {
	const error = fromPrisma(err) ?? err;
	const isHttpError = error instanceof HttpError;
	const statusCode = isHttpError ? error.statusCode : 500;
	const expose = isHttpError ? error.expose : false;

	logger.error(err.message, {
		statusCode,
		stack: err.stack,
		path: req.path,
		method: req.method,
		expose,
		// Present only when Prisma raised this, and the first thing worth
		// knowing when a 500 turns out to be a database error.
		...(err instanceof Prisma.PrismaClientKnownRequestError && {
			prismaCode: err.code,
		}),
	});

	res.status(statusCode).json({
		success: false,
		message: expose ? error.message : "Internal server error",
		...(env.NODE_ENV === "development" && { stack: err.stack }),
	});
};

export const notFoundHandler = (
	req: Request,
	_res: Response,
	next: NextFunction
): void => {
	next(createError(404, `Route not found: ${req.method} ${req.path}`));
};
