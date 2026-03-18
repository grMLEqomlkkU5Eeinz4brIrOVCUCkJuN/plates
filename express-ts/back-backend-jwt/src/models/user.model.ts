import { z } from "zod";

export const userSchema = z.object({
	id: z.uuid(),
	email: z.email(),
	name: z.string().min(1).max(100),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export const createUserSchema = userSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const updateUserSchema = createUserSchema.partial();

export type UserData = z.infer<typeof userSchema>;
export type CreateUserData = z.infer<typeof createUserSchema>;
export type UpdateUserData = z.infer<typeof updateUserSchema>;

export class User {
	readonly id: string;
	email: string;
	name: string;
	readonly createdAt: Date;
	updatedAt: Date;

	constructor(data: UserData) {
		this.id = data.id;
		this.email = data.email;
		this.name = data.name;
		this.createdAt = data.createdAt;
		this.updatedAt = data.updatedAt;
	}

	static create(data: CreateUserData): User {
		const now = new Date();
		return new User({
			id: crypto.randomUUID(),
			...data,
			createdAt: now,
			updatedAt: now,
		});
	}

	update(data: UpdateUserData): void {
		if (data.email !== undefined) this.email = data.email;
		if (data.name !== undefined) this.name = data.name;
		this.updatedAt = new Date();
	}

	toJSON(): UserData {
		return {
			id: this.id,
			email: this.email,
			name: this.name,
			createdAt: this.createdAt,
			updatedAt: this.updatedAt,
		};
	}
}
