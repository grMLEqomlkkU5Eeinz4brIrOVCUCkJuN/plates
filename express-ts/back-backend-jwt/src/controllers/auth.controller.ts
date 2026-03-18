import { Request, Response } from "express";
import { z } from "zod";
import {
	generateAccessToken,
	generateRefreshToken,
	verifyRefreshToken,
	setAuthCookies,
	clearAuthCookies,
} from "../middleware/auth";
import { generateToken } from "../middleware/csrf";
import { createError } from "../middleware/errorHandler";

export const loginSchema = z.object({
	email: z.email("Invalid email format"),
	password: z.string().min(1, "Password is required"),
});

export type LoginData = z.infer<typeof loginSchema>;

export const login = (req: Request, res: Response): void => {
	const { email } = req.body as LoginData;

	// TODO: Replace with actual user authentication logic
	// This is a placeholder - in production, verify credentials against your database
	const userId = "user-" + Math.random().toString(36).substring(2, 9);

	const tokenPayload = { userId, email };
	const accessToken = generateAccessToken(tokenPayload);
	const refreshToken = generateRefreshToken(tokenPayload);

	setAuthCookies(res, accessToken, refreshToken);

	res.json({
		success: true,
		message: "Login successful",
		user: { userId, email },
		csrfToken: generateToken(req, res),
	});
};

export const logout = (_req: Request, res: Response): void => {
	clearAuthCookies(res);

	res.json({
		success: true,
		message: "Logout successful",
	});
};

export const refresh = (req: Request, res: Response): void => {
	const refreshToken = req.cookies?.refresh_token;

	if (!refreshToken) {
		throw createError(401, "Refresh token required");
	}

	try {
		const payload = verifyRefreshToken(refreshToken);
		const tokenPayload = { userId: payload.userId, email: payload.email };

		const newAccessToken = generateAccessToken(tokenPayload);
		const newRefreshToken = generateRefreshToken(tokenPayload);

		setAuthCookies(res, newAccessToken, newRefreshToken);

		res.json({
			success: true,
			message: "Tokens refreshed",
			csrfToken: generateToken(req, res),
		});
	} catch {
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
