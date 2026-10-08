import { type } from "arktype";
import type { ErrorCode } from "../lib/errors";
import { HTTP_STATUS } from "../rest/errors";
import { named } from "./registry";

/**
 * Response shapes, as the client receives them: after JSON serialisation, so timestamps
 * are strings. No service declares its output as a schema (they return Drizzle rows), so
 * these are written from what the handlers actually send, and the response check in
 * the tests (responseCheck.ts) holds every REST response in the suite against them.
 */
const timestamp = type("string.date.iso").describe("an ISO 8601 timestamp");

export const UserView = named(
	"User",
	type({
		id: "string.uuid",
		email: "string",
		name: "string",
		role: "'user' | 'admin'",
		createdAt: timestamp,
		updatedAt: timestamp,
	}),
);

export const PostView = named(
	"Post",
	type({
		id: "string.uuid",
		title: "string",
		body: "string",
		published: "boolean",
		authorId: "string.uuid",
		createdAt: timestamp,
		updatedAt: timestamp,
	}),
);

export const OkView = named("Ok", type({ ok: "true" }));

export const HealthView = named("Health", type({ status: "'ok'", uptime: "number" }));

/** rest/errors.ts's body. The codes are lib/errors.ts's, read off the status map. */
export const ErrorBody = named(
	"Error",
	type({
		error: {
			code: type.enumerated(...(Object.keys(HTTP_STATUS) as ErrorCode[])),
			message: "string",
			requestId: "string",
		},
	}),
);
