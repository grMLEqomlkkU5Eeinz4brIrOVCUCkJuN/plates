import { Request, Response } from "express";
import { authOf, clearAuthCookies } from "../middleware/auth";
import { clearCsrfCookie } from "../middleware/csrf";
import {
	deleteAccount,
	findAccount,
	findPublicUser,
	listPublicUsers,
	updateAccount,
} from "../services/user.service";
import type {
	DeleteAccountInput,
	ListUsersQuery,
	UpdateAccountInput,
} from "../models/user.model";

/**
 * Express 5 forwards a rejected promise from a handler to the error middleware
 * by itself, which is why these are plain `async` functions with no wrapper
 * around them. Nothing here catches: the services translate what the driver
 * throws into an HttpError, and everything else is a 500 the error handler
 * logs with its stack.
 */
export const getAccount = async (req: Request, res: Response): Promise<void> => {
	res.json({ user: await findAccount(authOf(req).userId) });
};

export const patchAccount = async (req: Request, res: Response): Promise<void> => {
	const user = await updateAccount(authOf(req).userId, req.body as UpdateAccountInput);

	res.json({ user });
};

/** 204 and the account is gone. The cookies are expired with it; the token
 *  they carried would answer UNAUTHENTICATED on its next use anyway. */
export const closeAccount = async (req: Request, res: Response): Promise<void> => {
	await deleteAccount(authOf(req).userId, (req.body as DeleteAccountInput).password);

	clearAuthCookies(res);
	clearCsrfCookie(res);
	res.status(204).send();
};

export const listUsers = async (req: Request, res: Response): Promise<void> => {
	// validate() has replaced req.query with the parsed value. Express types
	// the property as ParsedQs whatever ran before the handler, and the two
	// shapes do not overlap enough for a plain cast, hence the two-step one.
	const users = await listPublicUsers(req.query as unknown as ListUsersQuery);

	res.json({ users });
};

export const getUser = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
	res.json({ user: await findPublicUser(req.params.id) });
};
