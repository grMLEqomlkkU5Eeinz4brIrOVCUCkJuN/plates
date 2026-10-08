import { type } from "arktype";

// The input contracts, apart from the services so that src/openapi can import them
// without pulling in config/env. Services, the tRPC routers, the REST twins and the
// OpenAPI registry all hold these same objects.

export const SetRoleInput = type({
	userId: "string.uuid",
	role: "'user' | 'admin'",
});

export const UserIdInput = type({ userId: "string.uuid" });
