import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError } from "./errorHandler";

type RequestLocation = "body" | "query" | "params";

interface ValidationSchema {
	body?: z.ZodSchema;
	query?: z.ZodSchema;
	params?: z.ZodSchema;
}

const formatZodError = (error: z.ZodError): string => {
	return z.prettifyError(error);
};

export const validate = (schema: ValidationSchema) => {
	return (req: Request, _res: Response, next: NextFunction): void => {
		const locations: RequestLocation[] = ["body", "query", "params"];

		for (const location of locations) {
			const locationSchema = schema[location];
			if (!locationSchema) continue;

			const result = locationSchema.safeParse(req[location]);
			if (!result.success) {
				return next(
					new AppError(400, `Validation error in ${location}: ${formatZodError(result.error)}`)
				);
			}
			req[location] = result.data;
		}

		next();
	};
};
