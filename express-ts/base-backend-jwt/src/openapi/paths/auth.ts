import { z } from "zod";
import { loginSchema } from "../../models/auth.model";
import { describeRoutes, named } from "../registry";

const csrfToken = z.string().openapi({
	description: "Send back as x-csrf-token on state-changing requests.",
});

const csrfTokenResponse = named(
	"CsrfTokenResponse",
	z.strictObject({ csrfToken })
);

const loginResponse = named(
	"LoginResponse",
	z.strictObject({
		success: z.literal(true),
		message: z.string(),
		user: z.strictObject({ userId: z.string(), email: z.email() }),
		csrfToken,
	})
);

const refreshResponse = named(
	"RefreshResponse",
	z.strictObject({
		success: z.literal(true),
		message: z.string(),
		csrfToken,
	})
);

const logoutResponse = named(
	"LogoutResponse",
	z.strictObject({ success: z.literal(true), message: z.string() })
);

// req.user is the decoded access token, so jsonwebtoken's iat and exp ride along.
const meResponse = named(
	"MeResponse",
	z.strictObject({
		success: z.literal(true),
		user: z.strictObject({
			userId: z.string(),
			email: z.email(),
			iat: z.number().int(),
			exp: z.number().int(),
		}),
	})
);

describeRoutes([
	{
		method: "get",
		path: "/auth/csrf-token",
		operationId: "getCsrfToken",
		summary: "Get CSRF token",
		description:
			"Returns a CSRF token for use in subsequent state-changing requests",
		tags: ["Auth"],
		access: "open",
		responses: {
			200: { description: "CSRF token generated", schema: csrfTokenResponse },
		},
	},
	{
		method: "post",
		path: "/auth/login",
		operationId: "login",
		summary: "Login user",
		description: "Authenticates user and sets JWT cookies",
		tags: ["Auth"],
		access: "open",
		request: { body: loginSchema },
		responses: {
			200: { description: "Login successful", schema: loginResponse },
			400: "Validation error",
		},
	},
	{
		method: "post",
		path: "/auth/logout",
		operationId: "logout",
		summary: "Logout user",
		description: "Clears JWT cookies",
		tags: ["Auth"],
		access: "session",
		csrf: true,
		responses: {
			200: { description: "Logout successful", schema: logoutResponse },
			401: "Not authenticated",
			403: "Invalid CSRF token",
		},
	},
	{
		method: "post",
		path: "/auth/refresh",
		operationId: "refresh",
		summary: "Refresh tokens",
		description:
			"Uses refresh token to generate new access and refresh tokens",
		tags: ["Auth"],
		access: "refresh",
		csrf: true,
		responses: {
			200: { description: "Tokens refreshed", schema: refreshResponse },
			401: "Invalid or expired refresh token",
			403: "Invalid CSRF token",
		},
	},
	{
		method: "get",
		path: "/auth/me",
		operationId: "getMe",
		summary: "Get current user",
		description: "Returns the authenticated user's information",
		tags: ["Auth"],
		access: "session",
		responses: {
			200: { description: "User information", schema: meResponse },
			401: "Not authenticated",
		},
	},
]);
