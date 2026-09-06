import { z } from "zod";
import type { User } from "../generated/prisma/client";

/**
 * prisma/schema.prisma owns the shape of a row; zod owns what a client is
 * allowed to send. Both are needed: the generated types vanish at runtime, and
 * a request body is untrusted input until something has parsed it.
 */
export type UserData = User;

/**
 * `satisfies` is the drift check. Add a column in the schema, forget it here,
 * and this line stops compiling - which is the whole point of writing the row
 * shape twice.
 */
export const userSchema = z.object({
	id: z.uuid(),
	email: z.email(),
	name: z.string().min(1).max(100),
	createdAt: z.date(),
	updatedAt: z.date(),
}) satisfies z.ZodType<UserData>;

// The database fills these in - `@default(uuid())`, `@default(now())` and
// `@updatedAt` - so a client that sends them is ignored rather than obeyed.
export const createUserSchema = userSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
});
export const updateUserSchema = createUserSchema.partial();

export type CreateUserData = z.infer<typeof createUserSchema>;
export type UpdateUserData = z.infer<typeof updateUserSchema>;
