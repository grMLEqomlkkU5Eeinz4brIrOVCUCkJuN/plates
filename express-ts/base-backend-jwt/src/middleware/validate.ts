import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { createError } from "./errorHandler";

type RequestLocation = "body" | "query" | "params";

interface ValidationSchema {
	body?: z.ZodSchema;
	query?: z.ZodSchema;
	params?: z.ZodSchema;
}

type ValidateMiddleware = ((
	req: Request,
	_res: Response,
	next: NextFunction
) => void) & {
	/** Read by the openapi tests, which check the description uses these same objects. */
	schemas: ValidationSchema;
};

export const validate = (schema: ValidationSchema): ValidateMiddleware => {
	const middleware = (req: Request, _res: Response, next: NextFunction): void => {
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
				// Express 5 makes req.query a getter that parses the URL again on
				// every read, so anything assigned onto it is lost: defaults and
				// coerced numbers would never reach the handler. Shadow it instead.
				Object.defineProperty(req, "query", {
					value: result.data,
					writable: true,
					configurable: true,
				});
			} else {
				req[location] = result.data;
			}
		}

		next();
	};

	return Object.assign(middleware, { schemas: schema });
};
