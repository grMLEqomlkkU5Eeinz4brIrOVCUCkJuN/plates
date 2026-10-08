import { z } from "zod";
import {
	createUserSchema,
	listUsersQuerySchema,
	updateUserSchema,
	userIdParamsSchema,
	userSchema,
} from "../../models/user.model";
import { describeRoutes, named } from "../registry";

const user = named("User", userSchema);
const userPage = named(
	"UserPage",
	z.strictObject({
		items: z.array(user),
		total: z.number().int(),
		limit: z.number().int(),
		offset: z.number().int(),
	})
);

describeRoutes([
	{
		method: "get",
		path: "/users",
		operationId: "getUsers",
		summary: "List users, oldest first, one page at a time",
		tags: ["Users"],
		access: "open",
		request: { query: listUsersQuerySchema },
		responses: {
			200: { description: "One page of users and the total count", schema: userPage },
			400: "limit is not 1 to 100, or offset is negative",
		},
	},
	{
		method: "post",
		path: "/users",
		operationId: "createUser",
		summary: "Create a new user",
		tags: ["Users"],
		access: "open",
		request: { body: createUserSchema },
		responses: {
			201: { description: "User created", schema: user },
			400: "Validation error",
		},
	},
	{
		method: "get",
		path: "/users/:id",
		operationId: "getUserById",
		summary: "Get user by ID",
		tags: ["Users"],
		access: "open",
		request: { params: userIdParamsSchema },
		responses: {
			200: { description: "User found", schema: user },
			400: "The id is not a uuid",
			404: "User not found",
		},
	},
	{
		method: "patch",
		path: "/users/:id",
		operationId: "updateUser",
		summary: "Update user",
		tags: ["Users"],
		access: "open",
		request: { params: userIdParamsSchema, body: updateUserSchema },
		responses: {
			200: { description: "User updated", schema: user },
			400: "The id is not a uuid, or validation error in the body",
			404: "User not found",
		},
	},
	{
		method: "delete",
		path: "/users/:id",
		operationId: "deleteUser",
		summary: "Delete user",
		tags: ["Users"],
		access: "open",
		request: { params: userIdParamsSchema },
		responses: {
			204: { description: "User deleted" },
			400: "The id is not a uuid",
			404: "User not found",
		},
	},
]);
