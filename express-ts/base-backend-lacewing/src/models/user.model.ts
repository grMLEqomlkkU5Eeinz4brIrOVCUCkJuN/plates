import { z } from "zod";

export const userSchema = z.object({
	id: z.uuid(),
	email: z.email(),
	name: z.string().min(1).max(100),
	createdAt: z.date(),
	updatedAt: z.date(),
});

const userFields = userSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
});

// The ids name the OpenAPI components; see models/auth.model.ts for why here.
export const createUserSchema = userFields.meta({ id: "CreateUser" });
export const updateUserSchema = userFields.partial().meta({ id: "UpdateUser" });

export const userIdParamsSchema = z.object({
	id: z.string().uuid("Invalid user ID format"),
});

export type UserData = z.infer<typeof userSchema>;
export type CreateUserData = z.infer<typeof createUserSchema>;
export type UpdateUserData = z.infer<typeof updateUserSchema>;

export const createUser = (data: CreateUserData): UserData => {
	const now = new Date();
	return {
		id: crypto.randomUUID(),
		...data,
		createdAt: now,
		updatedAt: now,
	};
};

export const updateUser = (user: UserData, data: UpdateUserData): UserData => ({
	...user,
	...data,
	updatedAt: new Date(),
});
