import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { httpError } from "./errorHandler";

type RequestLocation = "body" | "query" | "params";

interface ValidationSchema {
	body?: z.ZodSchema;
	query?: z.ZodSchema;
	params?: z.ZodSchema;
}

/**
 * The trust boundary. Everything downstream of a route that runs this can
 * treat req.body as the parsed type, because the parsed value replaces the raw
 * one here: a handler cannot accidentally read a field the schema stripped.
 *
 * Body schemas are strict objects (see models/), so an unknown field is a 400
 * rather than a value that gets quietly dropped. That is what stops a caller
 * from posting `passwordHash` alongside a profile edit and hoping it binds.
 */
export const validate = (schema: ValidationSchema) => {
	return (req: Request, _res: Response, next: NextFunction): void => {
		const locations: RequestLocation[] = ["body", "query", "params"];

		for (const location of locations) {
			const locationSchema = schema[location];
			if (!locationSchema) continue;

			const result = locationSchema.safeParse(req[location]);
			if (!result.success) {
				return next(
					httpError(400, `Invalid request ${location}.`, {
						errorCode: "VALIDATION_ERROR",
						details: result.error.issues.map((issue) => ({
							field: [location, ...issue.path].join("."),
							message: issue.message,
						})),
					})
				);
			}
			if (location === "query") {
				// Express 5 made req.query a getter that re-parses the URL on
				// every access, so assigning into the object it returns is
				// discarded by the next read: defaults, coercions and stripped
				// keys all silently do nothing, and a handler reading
				// `req.query.limit` gets the raw string however the schema was
				// written. Redefining the property is what replaces it.
				Object.defineProperty(req, "query", {
					value: result.data,
					writable: true,
					enumerable: true,
					configurable: true,
				});
			} else {
				req[location] = result.data;
			}
		}

		next();
	};
};
