import { Request, Response } from "express";
import { User, CreateUserData, UpdateUserData } from "../models/user.model";
import { AppError } from "../middleware/errorHandler";

// In-memory store for demo purposes - replace with your database
const users = new Map<string, User>();

export const createUser = (req: Request, res: Response): void => {
	const data = req.body as CreateUserData;
	const user = User.create(data);
	users.set(user.id, user);

	res.status(201).json(user.toJSON());
};

export const getUsers = (_req: Request, res: Response): void => {
	const allUsers = Array.from(users.values()).map((u) => u.toJSON());
	res.json(allUsers);
};

export const getUserById = (req: Request, res: Response): void => {
	const user = users.get(req.params.id);
	if (!user) {
		throw new AppError(404, "User not found");
	}

	res.json(user.toJSON());
};

export const updateUser = (req: Request, res: Response): void => {
	const user = users.get(req.params.id);
	if (!user) {
		throw new AppError(404, "User not found");
	}

	const data = req.body as UpdateUserData;
	user.update(data);

	res.json(user.toJSON());
};

export const deleteUser = (req: Request, res: Response): void => {
	const exists = users.delete(req.params.id);
	if (!exists) {
		throw new AppError(404, "User not found");
	}

	res.status(204).send();
};
