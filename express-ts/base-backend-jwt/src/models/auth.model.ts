import { z } from "zod";

export const loginSchema = z
	.object({
		email: z.email("Invalid email format"),
		password: z.string().min(1, "Password is required"),
	})
	.meta({ id: "LoginRequest" });

export type LoginData = z.infer<typeof loginSchema>;
