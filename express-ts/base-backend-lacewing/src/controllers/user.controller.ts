import { Request, Response } from "express";
import {
	createUser,
	updateUser,
	CreateUserData,
	UpdateUserData,
	UserData,
} from "../models/user.model";
import { createError } from "../middleware/errorHandler";

// In-memory store for demo purposes - replace with your database
const users = new Map<string, UserData>();

export const createUserHandler = (req: Request, res: Response): void => {
	const user = createUser(req.body as CreateUserData);
	users.set(user.id, user);

	res.status(201).json(user);
};

export const getUsers = (_req: Request, res: Response): void => {
	res.json([...users.values()]);
};

export const getUserById = (
	req: Request<{ id: string }>,
	res: Response
): void => {
	const user = users.get(req.params.id);
	if (!user) throw createError(404, "User not found");

	res.json(user);
};

export const updateUserHandler = (
	req: Request<{ id: string }>,
	res: Response
): void => {
	const user = users.get(req.params.id);
	if (!user) throw createError(404, "User not found");

	const updated = updateUser(user, req.body as UpdateUserData);
	users.set(updated.id, updated);

	res.json(updated);
};

export const deleteUser = (
	req: Request<{ id: string }>,
	res: Response
): void => {
	if (!users.delete(req.params.id)) throw createError(404, "User not found");

	res.status(204).send();
};
