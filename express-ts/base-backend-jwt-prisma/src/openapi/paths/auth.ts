import { z } from "zod";
import { loginSchema, registerSchema } from "../../models/auth.model";
import { describeRoutes, named } from "../registry";
import { account } from "./user.schemas";

const csrfToken = z.string().openapi({
	description: "Send back as the x-csrf-token header on every mutation.",
});

const session = named("Session", z.strictObject({ user: account, csrfToken }));
const csrfTokenEnvelope = named("CsrfToken", z.strictObject({ csrfToken }));

// Every credential endpoint here is rate limited, login included: login is
// the endpoint an attacker makes progress against by repeating it.
describeRoutes([
	{
		method: "get",
		path: "/auth/csrf-token",
		operationId: "getCsrfToken",
		summary: "A CSRF token for the session in hand, or for an anonymous caller.",
		description:
			"Login and register return one alongside the cookies, so this is only needed after a page reload. Send it back as the x-csrf-token header on every mutation.",
		tags: ["Auth"],
		access: "public",
		responses: {
			200: { description: "Token issued.", schema: csrfTokenEnvelope },
		},
	},
	{
		method: "post",
		path: "/auth/register",
		operationId: "register",
		summary: "Create an account and open a session.",
		tags: ["Auth"],
		access: "public",
		request: { body: registerSchema },
		responses: {
			201: {
				description: "Account created; session cookies set; csrfToken in the body.",
				schema: session,
			},
			400: "VALIDATION_ERROR.",
			409: "EMAIL_TAKEN.",
			429: "RATE_LIMITED.",
		},
	},
	{
		method: "post",
		path: "/auth/login",
		operationId: "login",
		summary: "Exchange email and password for session cookies.",
		tags: ["Auth"],
		access: "public",
		request: { body: loginSchema },
		responses: {
			200: { description: "Session opened; csrfToken in the body.", schema: session },
			400: "VALIDATION_ERROR.",
			401: "INVALID_CREDENTIALS.",
			429: "RATE_LIMITED.",
		},
	},
	{
		method: "post",
		path: "/auth/refresh",
		operationId: "refresh",
		summary: "Rotate the refresh cookie for a new pair.",
		description:
			"Refresh tokens are single use. Presenting one twice revokes the whole family and answers REFRESH_REUSED; either way the cookies are cleared on failure. Needs x-csrf-token, bound to the access cookie, which the browser keeps for the refresh lifetime even after the JWT inside has expired.",
		tags: ["Auth"],
		access: "public",
		csrf: true,
		responses: {
			200: { description: "New cookies set; csrfToken in the body.", schema: csrfTokenEnvelope },
			401: "REFRESH_INVALID or REFRESH_REUSED.",
			403: "CSRF_INVALID.",
			429: "RATE_LIMITED.",
		},
	},
	{
		method: "post",
		path: "/auth/logout",
		operationId: "logout",
		summary: "Revoke this session and expire its cookies.",
		description:
			"The access token itself stays valid until it expires, which is at most JWT_ACCESS_EXPIRY away; the refresh chain is dead immediately.",
		tags: ["Auth"],
		access: "session",
		csrf: true,
		responses: {
			204: { description: "Session revoked." },
			401: "UNAUTHENTICATED, TOKEN_EXPIRED or TOKEN_INVALID.",
			403: "CSRF_INVALID.",
		},
	},
]);
