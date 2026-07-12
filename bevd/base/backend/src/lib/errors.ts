import { type Type, type } from "arktype";

/**
 * One error vocabulary for the whole app.
 *
 * Services throw these. They know nothing about tRPC or gRPC - each transport
 * translates an AppError into its own status (see trpc/trpc.ts and grpc/server.ts).
 * That is what lets a single service back both APIs without leaking either.
 */
export type ErrorCode =
	| "BAD_REQUEST"
	| "UNAUTHORIZED"
	| "FORBIDDEN"
	| "NOT_FOUND"
	| "CONFLICT"
	| "INTERNAL";

export class AppError extends Error {
	readonly code: ErrorCode;

	constructor(code: ErrorCode, message: string) {
		super(message);
		this.name = "AppError";
		this.code = code;
	}
}

/**
 * Validates with arktype and throws a BAD_REQUEST on failure.
 *
 * Services validate their own input rather than trusting the transport: tRPC checks
 * `.input()` before the call, but protobuf only guarantees field *shapes* - it has no
 * idea a title must be 1-200 characters. Validating here means both transports get
 * the same rules from the same schema.
 */
export function parseInput<T extends Type>(schema: T, input: unknown): T["infer"] {
	const result = schema(input);

	if (result instanceof type.errors) {
		throw new AppError("BAD_REQUEST", result.summary);
	}

	return result as T["infer"];
}
