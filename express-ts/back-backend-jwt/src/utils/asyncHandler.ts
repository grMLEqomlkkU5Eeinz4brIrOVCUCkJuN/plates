import { Request, Response, NextFunction, RequestHandler } from "express";
import logger from "./logger";

type AsyncRequestHandler<P = unknown, ResBody = unknown, ReqBody = unknown> = (
	req: Request<P, ResBody, ReqBody>,
	res: Response<ResBody>,
	next: NextFunction
) => void | Response | Promise<void | Response>;

/**
 * Wraps async route handlers to catch errors and pass them to Express error middleware.
 */
const asyncHandler = <P = unknown, ResBody = unknown, ReqBody = unknown>(
	fn: AsyncRequestHandler<P, ResBody, ReqBody>
): RequestHandler<P, ResBody, ReqBody> => {
	return (req, res, next) => {
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
