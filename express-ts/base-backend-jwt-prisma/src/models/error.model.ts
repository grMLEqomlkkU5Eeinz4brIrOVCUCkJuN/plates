import { z } from "zod";

/**
 * The codes clients branch on. The HTTP status says how to react in general,
 * the code says which failure it was, and the message is for a human reading
 * a log or a debug console. Adding a case here is how a new failure becomes
 * part of the contract; throwing a bare status is how it stays undocumented.
 */
export const errorCodes = [
	"VALIDATION_ERROR",
	"MALFORMED_BODY",
	"PAYLOAD_TOO_LARGE",
	"UNAUTHENTICATED",
	"TOKEN_INVALID",
	"TOKEN_EXPIRED",
	"INVALID_CREDENTIALS",
	"EMAIL_TAKEN",
	"REFRESH_INVALID",
	"REFRESH_REUSED",
	"CSRF_INVALID",
	"NOT_FOUND",
	"RATE_LIMITED",
	"DEPENDENCY_UNAVAILABLE",
	"INTERNAL",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

/** What middleware/errorHandler.ts sends for every failure. */
export const errorBodySchema = z.strictObject({
	success: z.literal(false),
	code: z.enum(errorCodes),
	message: z.string(),
	requestId: z.string(),
	// VALIDATION_ERROR only: one entry per failed field.
	details: z.array(z.strictObject({ field: z.string(), message: z.string() })).optional(),
	// Development only, on a 5xx.
	stack: z.string().optional(),
});
