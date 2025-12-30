import { Request, Response, NextFunction, RequestHandler } from "express";
import logger from "./logger";

type AsyncRequestHandler = (
	req: Request,
	res: Response,
	next: NextFunction
) => void | Response | Promise<void | Response>;

/**
 * Wraps async route handlers to catch errors and pass them to Express error middleware.
 */
const asyncHandler = (fn: AsyncRequestHandler): RequestHandler => {
	return (req: Request, res: Response, next: NextFunction) => {
		Promise.resolve(fn(req, res, next)).catch((error: Error) => {
			logger.error(`Route handler error: ${fn.name || "anonymous"}`, {
				message: error.message,
				stack: error.stack,
				path: req.path,
				method: req.method,
			});
			next(error);
		});
	};
};

export default asyncHandler;
