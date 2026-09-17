import { Request, Response } from "express";
import {
	ACCESS_COOKIE,
	REFRESH_COOKIE,
	authOf,
	clearAuthCookies,
	setAuthCookies,
} from "../middleware/auth";
import { clearCsrfCookie, generateToken } from "../middleware/csrf";
import { httpError } from "../middleware/errorHandler";
import {
	loginAccount,
	refreshSession,
	registerAccount,
	revokeSession,
	type SessionTokens,
} from "../services/auth.service";
import type { LoginInput, RegisterInput } from "../models/auth.model";

/**
 * Puts a session on the response: both cookies, and a CSRF token bound to the
 * new access token. The CSRF token is HMAC'd against the access_token cookie
 * (middleware/csrf.ts), and that cookie is only being set on this response,
 * not present on the request, so req.cookies is pointed at the token this
 * response just minted. Without that the token is bound to req.ip and every
 * mutation afterwards fails with a 403.
 */
const startSession = (req: Request, res: Response, tokens: SessionTokens): string => {
	setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
	req.cookies = { ...req.cookies, [ACCESS_COOKIE]: tokens.accessToken };

	return generateToken(req, res);
};

export const register = async (req: Request, res: Response): Promise<void> => {
	const { user, tokens } = await registerAccount(req.body as RegisterInput);

	res.status(201).json({ user, csrfToken: startSession(req, res, tokens) });
};

export const login = async (req: Request, res: Response): Promise<void> => {
	const { user, tokens } = await loginAccount(req.body as LoginInput);

	res.json({ user, csrfToken: startSession(req, res, tokens) });
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
	const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;

	if (!token) {
		throw httpError(401, "Refresh token is required.", { errorCode: "REFRESH_INVALID" });
	}

	try {
		const tokens = await refreshSession(token);

		res.json({ csrfToken: startSession(req, res, tokens) });
	} catch (error) {
		// Whatever the reason, the cookies in hand are dead; leaving them on
		// the browser would have every subsequent request fail the same way.
		clearAuthCookies(res);
		clearCsrfCookie(res);
		throw error;
	}
};

/** 204 and the session is over: its refresh-token family is revoked and the
 *  cookies are expired. The access token stays valid until it expires. */
export const logout = async (req: Request, res: Response): Promise<void> => {
	await revokeSession(authOf(req).sessionId);

	clearAuthCookies(res);
	clearCsrfCookie(res);
	res.status(204).send();
};

export const getCsrfToken = (req: Request, res: Response): void => {
	res.json({ csrfToken: generateToken(req, res) });
};
