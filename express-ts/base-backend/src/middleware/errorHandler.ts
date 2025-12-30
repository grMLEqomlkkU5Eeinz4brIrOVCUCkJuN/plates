import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import logger from "../utils/logger";

export class AppError extends Error {
	constructor(
		public statusCode: number,
		public message: string,
		public isOperational = true
	) {
		super(message);
		Object.setPrototypeOf(this, AppError.prototype);
		Error.captureStackTrace(this, this.constructor);
	}
}

export const errorHandler = (
	err: Error,
	req: Request,
	res: Response,
	_next: NextFunction
): void => {
	const isAppError = err instanceof AppError;
	const statusCode = isAppError ? err.statusCode : 500;
	const isOperational = isAppError ? err.isOperational : false;

	logger.error(err.message, {
		statusCode,
		stack: err.stack,
		path: req.path,
		method: req.method,
		isOperational,
	});

	res.status(statusCode).json({
		success: false,
		message: isOperational ? err.message : "Internal server error",
		...(env.NODE_ENV === "development" && { stack: err.stack }),
	});
};

export const notFoundHandler = (
	req: Request,
	_res: Response,
	next: NextFunction
): void => {
	next(new AppError(404, `Route not found: ${req.method} ${req.path}`));
};
