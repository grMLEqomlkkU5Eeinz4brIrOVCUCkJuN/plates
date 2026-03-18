import { Request, Response, NextFunction } from "express";
import createError, { HttpError } from "http-errors";
import { env } from "../config/env";
import logger from "../utils/logger";

export { createError, HttpError };

export const errorHandler = (
	err: Error,
	req: Request,
	res: Response,
	_next: NextFunction
): void => {
	const isHttpError = err instanceof HttpError;
	const statusCode = isHttpError ? err.statusCode : 500;
	const expose = isHttpError ? err.expose : false;

	logger.error(err.message, {
		statusCode,
		stack: err.stack,
		path: req.path,
		method: req.method,
		expose,
	});

	res.status(statusCode).json({
		success: false,
		message: expose ? err.message : "Internal server error",
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
