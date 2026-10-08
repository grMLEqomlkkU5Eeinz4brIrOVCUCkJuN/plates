import { type } from "arktype";

// The input contracts, apart from the services so that src/openapi can import them
// without pulling in config/env. Services, the tRPC routers, the REST twins and the
// OpenAPI registry all hold these same objects.

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
