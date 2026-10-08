import { Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";
import { createError } from "./errorHandler";

type RequestLocation = "body" | "query" | "params";

export interface ValidationSchema {
	body?: z.ZodSchema;
	query?: z.ZodSchema;
	params?: z.ZodSchema;
}

const formatZodError = (error: z.ZodError): string => {
	return z.prettifyError(error);
};

/**
 * The schemas ride on the middleware so the openapi tests can check that a
 * route's description holds the very objects its validator runs.
 */
export const validate = (
	schema: ValidationSchema
): RequestHandler & { schema: ValidationSchema } => {
	const middleware = (
		req: Request,
		_res: Response,
		next: NextFunction
	): void => {
		const locations: RequestLocation[] = ["body", "query", "params"];

		for (const location of locations) {
			const locationSchema = schema[location];
			if (!locationSchema) continue;

			const result = locationSchema.safeParse(req[location]);
			if (!result.success) {
				return next(
					createError(
						400,
						`Validation error in ${location}: ${formatZodError(result.error)}`
					)
				);
			}
			if (location === "query") {
				Object.assign(req.query, result.data);
			} else {
				req[location] = result.data;
			}
		}

		next();
	};
	return Object.assign(middleware, { schema });
};
