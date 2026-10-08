import { z } from "zod";
import type { User } from "../generated/prisma/client";
import { email, name } from "./auth.model";

/**
 * The two shapes a users row is allowed to leave the process in. Nothing else
 * serialises one, and the row itself never leaves, because it carries
 * `passwordHash`.
 */

/** What the account holder sees about themselves. Dates are Date objects
 *  here; they reach the client as ISO 8601 strings. */
export const accountSchema = z.strictObject({
	id: z.uuid(),
	email: z.string(),
	name: z.string(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

/** What any signed-in caller may see about anyone. No email: it is a login
 *  identifier, and a directory of them is a phishing list. */
export const publicUserSchema = z.strictObject({
	id: z.uuid(),
	name: z.string(),
	createdAt: z.date(),
});

export type Account = z.infer<typeof accountSchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;

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
const NOTHING_TO_CHANGE = "Name at least one field to change.";

export const updateAccountSchema = z
	.strictObject({
		email: email.optional(),
		name: name.optional(),
	})
	.refine((patch) => Object.keys(patch).length > 0, NOTHING_TO_CHANGE)
	.describe(`Every field is optional, but an empty object is a 400: "${NOTHING_TO_CHANGE}"`);

/** Closing an account is final, so it asks for the password rather than
 *  trusting the session in hand. */
export const deleteAccountSchema = z.strictObject({
	password: z.string().min(1).max(128),
});

export const userIdParams = z.object({
	id: z.uuid("Not a user id."),
});

/**
 * Offset pagination over (createdAt, id). The ceiling is server-enforced, so a
 * caller cannot ask for the table. An offset can skip or repeat a row when an
 * account is created or closed between two pages; for a directory that is the
 * accepted price of a `total` the client can show.
 */
const LIST_LIMIT_MAX = 100;

export const listUsersQuery = z.object({
	limit: z.coerce.number().int().min(1).max(LIST_LIMIT_MAX).default(20),
	offset: z.coerce.number().int().min(0).default(0),
});

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuery>;

export interface PublicUserPage extends ListUsersQuery {
	items: PublicUser[];
	total: number;
}
