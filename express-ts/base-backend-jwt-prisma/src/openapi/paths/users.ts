import { z } from "zod";
import {
	deleteAccountSchema,
	listUsersQuery,
	updateAccountSchema,
	userIdParams,
} from "../../models/user.model";
import { describeRoutes, named } from "../registry";
import { account, publicUser } from "./user.schemas";

const accountEnvelope = named("AccountEnvelope", z.strictObject({ user: account }));
const publicUserEnvelope = named("PublicUserEnvelope", z.strictObject({ user: publicUser }));
const publicUserPage = named("PublicUserPage", z.strictObject({ users: z.array(publicUser) }));

const unauthenticated = "UNAUTHENTICATED, TOKEN_EXPIRED or TOKEN_INVALID.";

// No PATCH or DELETE /users/:id: the account routes act on the caller's own
// row, taken from the token.
describeRoutes([
	{
		method: "get",
		path: "/users/me",
		operationId: "getAccount",
		summary: "The signed-in account.",
		tags: ["Users"],
		access: "session",
		responses: {
			200: { description: "The account.", schema: accountEnvelope },
			401: unauthenticated,
		},
	},
	{
		method: "patch",
		path: "/users/me",
		operationId: "patchAccount",
		summary: "Change name or email.",
		description: "Unknown fields are a 400 rather than a silent drop.",
		tags: ["Users"],
		access: "session",
		csrf: true,
		request: { body: updateAccountSchema },
		responses: {
			200: { description: "The updated account.", schema: accountEnvelope },
			400: "VALIDATION_ERROR.",
			401: unauthenticated,
			403: "CSRF_INVALID.",
			409: "EMAIL_TAKEN.",
		},
	},
	{
		method: "delete",
		path: "/users/me",
		operationId: "closeAccount",
		summary: "Close the account. Final.",
		description:
			"Takes the current password: a borrowed session is not enough authority to delete an account. The row and its sessions go; the cookies are expired on the response.",
		tags: ["Users"],
		access: "session",
		csrf: true,
		request: { body: deleteAccountSchema },
		responses: {
			204: { description: "Account closed." },
			400: "VALIDATION_ERROR.",
			401: "INVALID_CREDENTIALS, or the session is not valid.",
			403: "CSRF_INVALID.",
			429: "RATE_LIMITED.",
		},
	},
	{
		method: "get",
		path: "/users",
		operationId: "listUsers",
		summary: "A page of users, oldest first.",
		description:
			"Cursor pagination. `cursor` is the id of the last user in the previous page; a page shorter than `limit` is the end. `limit` is capped at 100 on the server.",
		tags: ["Users"],
		access: "session",
		request: { query: listUsersQuery },
		responses: {
			200: { description: "The page.", schema: publicUserPage },
			400: "VALIDATION_ERROR.",
			401: unauthenticated,
		},
	},
	{
		method: "get",
		path: "/users/:id",
		operationId: "getUser",
		summary: "One user's public profile.",
		tags: ["Users"],
		access: "session",
		request: { params: userIdParams },
		responses: {
			200: { description: "The user.", schema: publicUserEnvelope },
			400: "VALIDATION_ERROR, when the id is not a uuid.",
			401: unauthenticated,
			404: "NOT_FOUND.",
		},
	},
]);
