import { LoginInput, RegisterInput } from "../../models/auth";
import { REST_PREFIX } from "../../rest/prefix";
import { describeRoutes } from "../registry";
import { OkView, UserView } from "../schemas";

const SESSION =
	"The access and refresh tokens go out as httpOnly cookies, with a fresh csrf_token cookie beside them; the body carries only the user.";

describeRoutes([
	{
		method: "post",
		path: `${REST_PREFIX}/auth/register`,
		operationId: "postRegister",
		summary: "Create an account with the user role and sign it in.",
		description: SESSION,
		tags: ["Auth"],
		access: "anyone",
		procedure: "auth.register",
		request: { body: RegisterInput },
		responses: {
			201: { description: "The new user.", schema: UserView, setsCookies: true },
			400: "The body failed validation.",
			403: "A cookie-authenticated request without its CSRF pair.",
			409: "That email is already registered.",
		},
	},
	{
		method: "post",
		path: `${REST_PREFIX}/auth/login`,
		operationId: "postLogin",
		summary: "Sign in with email and password.",
		description: SESSION,
		tags: ["Auth"],
		access: "anyone",
		procedure: "auth.login",
		request: { body: LoginInput },
		responses: {
			200: { description: "The signed-in user.", schema: UserView, setsCookies: true },
			400: "The body failed validation.",
			401: "Wrong email or password; the message does not say which.",
			403: "A cookie-authenticated request without its CSRF pair.",
		},
	},
	{
		method: "post",
		path: `${REST_PREFIX}/auth/refresh`,
		operationId: "postRefresh",
		summary: "Trade the refresh_token cookie for a new session, revoking the old token.",
		description: `${SESSION} A refresh token works once: the second use of the same one is a 401.`,
		tags: ["Auth"],
		access: "refreshCookie",
		procedure: "auth.refresh",
		responses: {
			200: {
				description: "The user the session belongs to.",
				schema: UserView,
				setsCookies: true,
			},
			401: "No refresh token, or one that is revoked, expired or unknown.",
			403: "A cookie-authenticated request without its CSRF pair.",
		},
	},
	{
		method: "post",
		path: `${REST_PREFIX}/auth/logout`,
		operationId: "postLogout",
		summary: "Revoke the refresh_token cookie's token, if one came, and clear the cookies.",
		description: "Signs out this browser only; other sessions of the same user stay valid.",
		tags: ["Auth"],
		access: "anyone",
		procedure: "auth.logout",
		responses: {
			200: {
				description: "Always ok, with or without a session.",
				schema: OkView,
				setsCookies: true,
			},
			403: "A cookie-authenticated request without its CSRF pair.",
		},
	},
	{
		method: "get",
		path: `${REST_PREFIX}/auth/me`,
		operationId: "getMe",
		summary: "The signed-in user.",
		tags: ["Auth"],
		access: "signedIn",
		procedure: "auth.me",
		responses: {
			200: { description: "The user the access token names.", schema: UserView },
			401: "Signed out, or the account no longer exists.",
		},
	},
]);
