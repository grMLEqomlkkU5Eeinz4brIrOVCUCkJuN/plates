import { z } from "zod";
import {
	createUserSchema,
	updateUserSchema,
	userIdParamsSchema,
	userSchema,
} from "../../models/user.model";
import { describeRoutes, named } from "../registry";

const user = named("User", userSchema);

describeRoutes([
	{
		method: "get",
		path: "/users",
		operationId: "getUsers",
		summary: "Get all users",
		description: "Every user, unpaginated.",
		tags: ["Users"],
		access: "bearer",
		responses: {
			200: { description: "List of users", schema: z.array(user) },
			401: "Unauthorized",
		},
	},
	{
		method: "post",
		path: "/users",
		operationId: "createUser",
		summary: "Create a new user",
		tags: ["Users"],
		access: "bearer",
		csrf: true,
		request: { body: createUserSchema },
		responses: {
			201: { description: "User created", schema: user },
			400: "Validation error",
			401: "Unauthorized",
			403: "Invalid CSRF token",
		},
	},
	{
		method: "get",
		path: "/users/:id",
		operationId: "getUserById",
		summary: "Get user by ID",
		tags: ["Users"],
		access: "bearer",
		request: { params: userIdParamsSchema },
		responses: {
			200: { description: "User found", schema: user },
			400: "The id is not a uuid",
			401: "Unauthorized",
			404: "User not found",
		},
	},
	{
		method: "patch",
		path: "/users/:id",
		operationId: "updateUser",
		summary: "Update user",
		tags: ["Users"],
		access: "bearer",
		csrf: true,
		request: { params: userIdParamsSchema, body: updateUserSchema },
		responses: {
			200: { description: "User updated", schema: user },
			400: "The id is not a uuid, or validation error",
			401: "Unauthorized",
			403: "Invalid CSRF token",
			404: "User not found",
		},
	},
	{
		method: "delete",
		path: "/users/:id",
		operationId: "deleteUser",
		summary: "Delete user",
		tags: ["Users"],
		access: "bearer",
		csrf: true,
		request: { params: userIdParamsSchema },
		responses: {
			204: { description: "User deleted" },
			400: "The id is not a uuid",
			401: "Unauthorized",
			403: "Invalid CSRF token",
			404: "User not found",
		},
	},
]);
