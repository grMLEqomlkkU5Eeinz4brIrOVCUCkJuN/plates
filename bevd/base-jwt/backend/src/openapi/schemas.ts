import { type } from "arktype";
import { ErrorBody } from "../rest/error-body";
import { named, timestamp } from "./registry";

/**
 * Response shapes. Requests need no schemas here: the routes validate with the services'
 * own input schemas, and the area files describe those same objects.
 *
 * These are written from db/schema.ts (PublicUser, Post) and from what the handlers
 * return. `"+": "reject"` makes an undeclared key a violation, so a response that starts
 * carrying `passwordHash` fails the test that sent it.
 */

export const UserSchema = named(
	"User",
	type({
		"+": "reject",
		id: "string.uuid",
		email: "string.email",
		name: "string",
		role: "'user' | 'admin'",
		createdAt: timestamp,
		updatedAt: timestamp,
	}),
);

export const LoggedOutSchema = named("LoggedOut", type({ "+": "reject", ok: "true" }));

export const PostSchema = named(
	"Post",
	type({
		"+": "reject",
		id: "string.uuid",
		title: "string",
		body: "string",
		published: "boolean",
		authorId: "string.uuid",
		createdAt: timestamp,
		updatedAt: timestamp,
	}),
);

export const PostListSchema = named("PostList", PostSchema.array());

export const HealthSchema = named(
	"Health",
	type({ "+": "reject", status: "'ok'", uptime: "number" }),
);

/** The body of every REST failure; see rest/errors.ts. */
export const ErrorSchema = named("Error", ErrorBody);
