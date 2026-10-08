import { type } from "arktype";

/**
 * Every REST error answers with this, and the OpenAPI document says so.
 *
 * Its own file, away from errors.ts, because errors.ts reaches the logger and so the
 * validated environment: the OpenAPI generator imports this and must run without a .env.
 */
export const ErrorBody = type({
	"+": "reject",
	error: {
		"+": "reject",
		code: "'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL'",
		message: "string",
		requestId: "string",
	},
});
