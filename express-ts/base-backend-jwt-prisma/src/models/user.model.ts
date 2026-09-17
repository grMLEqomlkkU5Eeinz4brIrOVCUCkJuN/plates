import { z } from "zod";
import type { User } from "../generated/prisma/client";
import { email, name } from "./auth.model";

/**
 * The two shapes a users row is allowed to leave the process in. Nothing else
 * serialises one, and the row itself never leaves, because it carries
 * `passwordHash`.
 */

/** What the account holder sees about themselves. */
export interface Account {
	id: string;
	email: string;
	name: string;
	createdAt: Date;
	updatedAt: Date;
}

/** What any signed-in caller may see about anyone. No email: it is a login
 *  identifier, and a directory of them is a phishing list. */
export interface PublicUser {
	id: string;
	name: string;
	createdAt: Date;
}

export const toAccount = (user: User): Account => ({
	id: user.id,
	email: user.email,
	name: user.name,
	createdAt: user.createdAt,
	updatedAt: user.updatedAt,
});

export const toPublicUser = (user: User): PublicUser => ({
	id: user.id,
	name: user.name,
	createdAt: user.createdAt,
});

/**
 * The profile surface. The field shapes are the ones registration uses, so a
 * name cannot mean one thing at sign-up and another on an edit. What is absent
 * is the point: the password has no edit here (it would need the old one, and
 * that is its own endpoint when you add it), and `id`, `createdAt` and
 * `passwordHash` are reachable from nowhere.
 */
export const updateAccountSchema = z
	.strictObject({
		email: email.optional(),
		name: name.optional(),
	})
	.refine((patch) => Object.keys(patch).length > 0, "Name at least one field to change.");

/** Closing an account is final, so it asks for the password rather than
 *  trusting the session in hand. */
export const deleteAccountSchema = z.strictObject({
	password: z.string().min(1).max(128),
});

export const userIdParams = z.object({
	id: z.uuid("Not a user id."),
});

/**
 * Cursor pagination, keyed on the row id after ordering by (createdAt, id).
 * The cursor is the id of the last row the caller was given; a page shorter
 * than `limit` is how the caller knows the list has ended. The ceiling is
 * server-enforced, so a caller cannot ask for the table.
 */
const LIST_LIMIT_MAX = 100;

export const listUsersQuery = z.object({
	limit: z.coerce.number().int().min(1).max(LIST_LIMIT_MAX).default(20),
	cursor: z.uuid("Not a cursor.").optional(),
});

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuery>;
