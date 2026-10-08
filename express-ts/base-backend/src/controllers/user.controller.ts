import { Request, Response } from "express";
import {
	User,
	CreateUserData,
	UpdateUserData,
	ListUsersQuery,
} from "../models/user.model";
import { createError } from "../middleware/errorHandler";

// In-memory store for demo purposes - replace with your database
const users = new Map<string, User>();

export const createUser = (req: Request, res: Response): void => {
	const data = req.body as CreateUserData;
	const user = User.create(data);
	users.set(user.id, user);

	res.status(201).json(user.toJSON());
};

export const getUsers = (req: Request, res: Response): void => {
	const { limit, offset } = req.query as unknown as ListUsersQuery;
	const items = Array.from(users.values())
		.slice(offset, offset + limit)
		.map((u) => u.toJSON());

	res.json({ items, total: users.size, limit, offset });
};

export const getUserById = (
	req: Request<{ id: string }>,
	res: Response
): void => {
	const user = users.get(req.params.id);
	if (!user) {
		throw createError(404, "User not found");
	}

	res.json(user.toJSON());
};

export const updateUser = (
	req: Request<{ id: string }>,
	res: Response
): void => {
	const user = users.get(req.params.id);
	if (!user) {
		throw createError(404, "User not found");
	}

	const data = req.body as UpdateUserData;
	user.update(data);

	res.json(user.toJSON());
};

export const deleteUser = (
	req: Request<{ id: string }>,
	res: Response
): void => {
	const exists = users.delete(req.params.id);
	if (!exists) {
		throw createError(404, "User not found");
	}

	res.status(204).send();
};
