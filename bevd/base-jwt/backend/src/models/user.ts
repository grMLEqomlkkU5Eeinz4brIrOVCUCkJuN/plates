import { type } from "arktype";

/** What the user service accepts. See models/auth.ts for why these live apart. */

export const SetRoleInput = type({
	userId: "string.uuid",
	role: "'user' | 'admin'",
});

export const UserIdInput = type({ userId: "string.uuid" });
