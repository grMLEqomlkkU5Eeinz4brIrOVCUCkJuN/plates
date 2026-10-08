import { type } from "arktype";

/**
 * What each service accepts, as arktype schemas. Every door validates with these exact
 * objects: tRPC's `.input()`, the REST routes, the services' own parseInput (which is all
 * gRPC gets), and the OpenAPI document describes them by identity.
 *
 * Kept apart from the services because a service module imports auth/jwt or the
 * database, and through them the validated environment. The OpenAPI generator imports
 * these and must run without a .env.
 */

export const RegisterInput = type({
	email: "string.email",
	name: "1 <= string <= 100",
	// argon2 has no length ceiling of its own - the cap is here only to stop someone
	// posting a megabyte and making us hash it. (bcrypt would have forced 72.)
	password: "8 <= string <= 128",
});

export const LoginInput = type({
	email: "string.email",
	password: "1 <= string <= 128",
});
