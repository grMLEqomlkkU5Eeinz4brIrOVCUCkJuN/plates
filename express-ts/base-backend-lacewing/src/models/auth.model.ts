import { z } from "zod";

// The id names the OpenAPI component. It sits here rather than in openapi/
// because .meta() returns a copy, and validate() must run the documented one.
export const loginSchema = z
	.object({
		email: z.email("Invalid email format"),
		password: z.string().min(1, "Password is required"),
	})
	.meta({ id: "LoginRequest" });

export type LoginData = z.infer<typeof loginSchema>;
