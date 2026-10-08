import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { createError } from "./errorHandler";

type RequestLocation = "body" | "query" | "params";

export interface ValidationSchema {
	body?: z.ZodSchema;
	query?: z.ZodSchema;
	params?: z.ZodSchema;
}

type ValidateMiddleware = ((
	req: Request,
	res: Response,
	next: NextFunction
) => void) & { schemas: ValidationSchema };

export const validate = (schema: ValidationSchema): ValidateMiddleware => {
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
						`Validation error in ${location}: ${z.prettifyError(result.error)}`
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

	// openapi.test.ts reads the schemas back to prove the document describes
	// the ones that run.
	return Object.assign(middleware, { schemas: schema });
};
