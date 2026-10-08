import { z } from "zod";
import { loginSchema } from "../../models/auth.model";
import { describeRoutes, named } from "../registry";

const csrfTokenSchema = named(
	"CsrfTokenResponse",
	z.strictObject({ csrfToken: z.string() })
);

const loginResponse = named(
	"LoginResponse",
	z.strictObject({
		success: z.literal(true),
		message: z.string(),
		user: z.strictObject({ userId: z.string(), email: z.string() }),
		csrfToken: z.string(),
	})
);

const refreshResponse = named(
	"RefreshResponse",
	z.strictObject({
		success: z.literal(true),
		message: z.string(),
		csrfToken: z.string(),
	})
);

const logoutResponse = named(
	"LogoutResponse",
	z.strictObject({ success: z.literal(true), message: z.string() })
);

/** The verified access token, as authenticate() puts it on req.user. */
const meResponse = named(
	"MeResponse",
	z.strictObject({
		success: z.literal(true),
		user: z.strictObject({
			userId: z.string(),
			email: z.string(),
			jti: z.string().openapi({ description: "What logout revokes." }),
			exp: z.number().int().openapi({ description: "Unix seconds." }),
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
			"Returns a CSRF token for use in subsequent state-changing requests, and sets the __csrf cookie it pairs with. It is bound to the access token cookie the request carried, if any.",
		tags: ["Auth"],
		access: "open",
		responses: {
			200: { description: "CSRF token generated", schema: csrfTokenSchema },
		},
	},
	{
		method: "post",
		path: "/auth/login",
		operationId: "login",
		summary: "Login user",
		description:
			"Sets the access_token and refresh_token cookies (HttpOnly, Secure) and returns a CSRF token bound to the new session. The tokens never appear in the body.",
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
		description:
			"Revokes the access token by its jti, so it stops working now rather than at expiry, and clears the auth and CSRF cookies.",
		tags: ["Auth"],
		access: "bearer",
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
			"Rotates the session: the refresh token used is revoked and a new access and refresh token pair is set as cookies. Replaying a used refresh token gets a 401.",
		tags: ["Auth"],
		access: "refresh",
		responses: {
			200: { description: "Tokens refreshed", schema: refreshResponse },
			401: "Missing, invalid, expired or already used refresh token",
		},
	},
	{
		method: "get",
		path: "/auth/me",
		operationId: "getMe",
		summary: "Get current user",
		description: "Returns the claims of the verified access token.",
		tags: ["Auth"],
		access: "bearer",
		responses: {
			200: { description: "User information", schema: meResponse },
			401: "Not authenticated",
		},
	},
]);
