import { LoginInput } from "../../models/auth";
import { describeRoutes } from "../registry";
import { LoggedOutSchema, UserSchema } from "../schemas";

const SETS_COOKIES =
	"Sets the access_token and refresh_token httpOnly cookies. The tokens never appear in the body.";

describeRoutes([
	{
		method: "post",
		path: "/api/v1/auth/login",
		operationId: "login",
		summary: "Start a session with an email and password.",
		description: SETS_COOKIES,
		tags: ["Auth"],
		access: "open",
		procedure: "auth.login",
		request: { body: LoginInput },
		responses: {
			200: { description: "The signed-in user.", schema: UserSchema },
			400: "The body does not match LoginInput.",
			401: "Wrong email or password. Both get the same answer, so the endpoint cannot be used to probe for accounts.",
		},
	},
	{
		method: "post",
		path: "/api/v1/auth/refresh",
		operationId: "refreshSession",
		summary: "Trade the refresh cookie for a new session.",
		description: `${SETS_COOKIES} The refresh token rotates: the one sent is revoked, so replaying it fails.`,
		tags: ["Auth"],
		access: "refresh",
		procedure: "auth.refresh",
		responses: {
			200: { description: "The user the session belongs to.", schema: UserSchema },
			401: "No refresh cookie, or it is unknown, revoked, expired or already used.",
		},
	},
	{
		method: "post",
		path: "/api/v1/auth/logout",
		operationId: "logout",
		summary: "End this session: revoke the refresh token and clear both cookies.",
		description:
			"Signs out this browser only, not every session. Takes no body but must be sent as content-type application/json, so a cross-site form cannot trigger it without a CORS preflight. Succeeds with no refresh cookie too: there is nothing to revoke and the cookies are cleared all the same.",
		tags: ["Auth"],
		access: "open",
		procedure: "auth.logout",
		responses: {
			200: { description: "Logged out.", schema: LoggedOutSchema },
			415: "Not sent as application/json.",
		},
	},
	{
		method: "get",
		path: "/api/v1/auth/me",
		operationId: "getMe",
		summary: "The signed-in user.",
		tags: ["Auth"],
		access: "bearer",
		procedure: "auth.me",
		responses: {
			200: {
				description: "The caller, as stored now (not as the token remembers).",
				schema: UserSchema,
			},
			401: "Not signed in, or the account no longer exists.",
		},
	},
]);
