import { Request, Response } from "express";
import { prisma } from "../db/prisma";
import { CreateUserData, UpdateUserData } from "../models/user.model";
import { createError } from "../middleware/errorHandler";

/**
 * Express 5 forwards a rejected promise from a handler to the error middleware
 * by itself, which is why these are plain `async` functions with no wrapper
 * around them. The Prisma errors that are really client mistakes - a duplicate
 * email, a row that is not there - are translated to status codes in
 * middleware/errorHandler.ts, so nothing here catches them.
 */
export const createUserHandler = async (
	req: Request,
	res: Response
): Promise<void> => {
	const user = await prisma.user.create({
		data: req.body as CreateUserData,
	});

	res.status(201).json(user);
};

export const getUsers = async (_req: Request, res: Response): Promise<void> => {
	res.json(await prisma.user.findMany({ orderBy: { createdAt: "asc" } }));
};

export const getUserById = async (
	req: Request<{ id: string }>,
	res: Response
): Promise<void> => {
	const user = await prisma.user.findUnique({
		where: { id: req.params.id },
	});
	if (!user) throw createError(404, "User not found");

	res.json(user);
};

export const updateUserHandler = async (
	req: Request<{ id: string }>,
	res: Response
): Promise<void> => {
	// No read before the write: `update` on a missing row raises P2025, which
	// errorHandler.ts turns into the same 404 a findUnique-then-update would -
	// without the window between the two where another request deletes it.
	const user = await prisma.user.update({
		where: { id: req.params.id },
		data: req.body as UpdateUserData,
	});

	res.json(user);
};

export const deleteUser = async (
	req: Request<{ id: string }>,
	res: Response
): Promise<void> => {
	await prisma.user.delete({ where: { id: req.params.id } });

	res.status(204).send();
};
