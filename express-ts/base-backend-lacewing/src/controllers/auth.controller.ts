import { Request, Response } from "express";
import { z } from "zod";
import {
	ACCESS_COOKIE,
	REFRESH_COOKIE,
	generateAccessToken,
	generateRefreshToken,
	verifyRefreshToken,
	revokeToken,
	setAuthCookies,
	clearAuthCookies,
} from "../middleware/auth";
import { generateToken } from "../middleware/csrf";
import { createError } from "../middleware/errorHandler";
import { readTokenCookie, JWTError } from "lacewing";

export const loginSchema = z.object({
	email: z.email("Invalid email format"),
	password: z.string().min(1, "Password is required"),
});

export type LoginData = z.infer<typeof loginSchema>;

export const login = async (req: Request, res: Response): Promise<void> => {
	const { email } = req.body as LoginData;

	// TODO: Replace with actual user authentication logic
	// This is a placeholder - in production, verify credentials against your database
	const userId = "user-" + Math.random().toString(36).substring(2, 9);

	const claims = { userId, email };
	const accessToken = await generateAccessToken(claims);
	const refreshToken = await generateRefreshToken(claims);

	setAuthCookies(res, accessToken, refreshToken);

	// The CSRF token is HMAC-bound to the session (see middleware/csrf.ts).
	// The session this response starts is the new access token - not the
	// cookie the request arrived with - so point the binding at it.
	req.cookies = { ...req.cookies, [ACCESS_COOKIE]: accessToken };

	res.json({
		success: true,
		message: "Login successful",
		user: { userId, email },
		csrfToken: generateToken(req, res),
	});
};

export const logout = async (req: Request, res: Response): Promise<void> => {
	// authenticate ran before us, so req.user is the verified access token.
	// Revoking its jti kills it now, not at exp - the whole point of
	// wiring a RevocationStore into the profile.
	if (req.user) await revokeToken(req.user);

	// The refresh cookie is path-scoped to /auth/refresh, so it does not
	// travel here; it dies with its own revocation on next refresh, or at
	// exp. (Wire a shared store lookup by sub if you need "logout
	// everywhere" semantics.)
	clearAuthCookies(res);

	res.json({
		success: true,
		message: "Logout successful",
	});
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
	const refreshToken = readTokenCookie(req.headers.cookie, REFRESH_COOKIE);

	if (!refreshToken) {
		throw createError(401, "Refresh token required");
	}

	try {
		const payload = await verifyRefreshToken(refreshToken);

		// Rotation: the old refresh token is revoked in the same breath as
		// the new pair is minted, so a stolen one is good for one use at
		// most - whoever refreshes second gets a 401.
		await revokeToken(payload);

		const claims = { userId: payload.userId, email: payload.email };
		const newAccessToken = await generateAccessToken(claims);
		const newRefreshToken = await generateRefreshToken(claims);

		setAuthCookies(res, newAccessToken, newRefreshToken);

		// Rebind the CSRF token to the rotated session, as in login.
		req.cookies = { ...req.cookies, [ACCESS_COOKIE]: newAccessToken };

		res.json({
			success: true,
			message: "Tokens refreshed",
			csrfToken: generateToken(req, res),
		});
	} catch (error) {
		if (!(error instanceof JWTError)) throw error;

		clearAuthCookies(res);
		throw createError(401, "Invalid or expired refresh token");
	}
};

export const getCsrfToken = (req: Request, res: Response): void => {
	res.json({
		csrfToken: generateToken(req, res),
	});
};

export const me = (req: Request, res: Response): void => {
	res.json({
		success: true,
		user: req.user,
	});
};
