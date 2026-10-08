import { type } from "arktype";
import { ERROR_CODES } from "../lib/errors";

/**
 * Every REST error answers with this, and the OpenAPI document says so.
 *
 * Its own file, away from errors.ts, so the OpenAPI schemas can import it without the
 * logger.
 */
export const ErrorBody = type({
	"+": "reject",
	error: {
		"+": "reject",
		code: type.enumerated(...ERROR_CODES),
		message: "string",
		requestId: "string",
	},
});
