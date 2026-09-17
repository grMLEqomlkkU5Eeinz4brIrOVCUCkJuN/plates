import { z } from "zod";

/**
 * The request shapes for the auth surface.
 *
 * Every object here is strict: an unknown field is a 400 rather than a value
 * that gets quietly dropped. That is what stops a caller from posting
 * `passwordHash` or `id` alongside a registration and hoping something binds
 * it. middleware/validate.ts replaces req.body with the parsed value, so a
 * handler never sees a field that is not named here.
 */

// Trimmed and lowercased before the format check, not after: a phone
// keyboard's trailing space is not a reason to refuse an address, and the
// unique index on users.email is case-sensitive, so the casing has to be
// settled here or one person can register twice.
export const email = z
	.string()
	.trim()
	.toLowerCase()
	.pipe(z.email("A valid email address is required.").max(254));

/**
 * Ten characters, no composition rules. Length is the only requirement that
 * survives contact with how people pick passwords, and argon2id is
 * what makes the stored form expensive to attack. The ceiling stops someone
 * posting a megabyte and making the server hash it.
 */
export const password = z
	.string()
	.min(10, "Passwords must be at least 10 characters.")
	.max(128, "Passwords must be at most 128 characters.");

export const name = z.string().trim().min(1).max(100);

export const registerSchema = z.strictObject({ email, name, password });

export const loginSchema = z.strictObject({
	email,
	// Not `password`: a login must accept whatever was set, and the length
	// floor could have been different when it was.
	password: z.string().min(1).max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
