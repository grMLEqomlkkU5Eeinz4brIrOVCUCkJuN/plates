import { Request, Response, NextFunction, CookieOptions } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { createError } from "./errorHandler";

export interface JwtPayload {
	userId: string;
	email: string;
	iat?: number;
	exp?: number;
}

export const generateAccessToken = (
	payload: Omit<JwtPayload, "iat" | "exp">
): string =>
	jwt.sign(payload, env.JWT_SECRET, {
		expiresIn: env.JWT_ACCESS_EXPIRY as jwt.SignOptions["expiresIn"],
	});

export const generateRefreshToken = (
	payload: Omit<JwtPayload, "iat" | "exp">
): string =>
	jwt.sign(payload, env.JWT_REFRESH_SECRET, {
		expiresIn: env.JWT_REFRESH_EXPIRY as jwt.SignOptions["expiresIn"],
	});

export const verifyAccessToken = (token: string): JwtPayload =>
	jwt.verify(token, env.JWT_SECRET) as JwtPayload;

export const verifyRefreshToken = (token: string): JwtPayload =>
	jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;

const cookieOptions = {
	httpOnly: true,
	secure: env.COOKIE_SECURE,
	sameSite: env.COOKIE_SAME_SITE,
} as const satisfies CookieOptions;

export const setAuthCookies = (
	res: Response,
	accessToken: string,
	refreshToken: string
): void => {
	res.cookie("access_token", accessToken, {
		...cookieOptions,
		maxAge: 15 * 60 * 1000, // 15 minutes
	});

	res.cookie("refresh_token", refreshToken, {
		...cookieOptions,
		maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
		path: "/api/v1/auth/refresh",
	});
};

export const clearAuthCookies = (res: Response): void => {
	res.clearCookie("access_token", cookieOptions);
	res.clearCookie("refresh_token", {
		...cookieOptions,
		path: "/api/v1/auth/refresh",
	});
};

export const authenticate = (
	req: Request,
	_res: Response,
	next: NextFunction
): void => {
	const token = req.cookies?.access_token;

	if (!token) throw createError(401, "Access token required");

	try {
		req.user = verifyAccessToken(token);
		next();
	} catch (error) {
		if (error instanceof jwt.TokenExpiredError)
			throw createError(401, "Access token expired");
		if (error instanceof jwt.JsonWebTokenError)
			throw createError(401, "Invalid access token");
		throw error;
	}
};

export const optionalAuth = (
	req: Request,
	_res: Response,
	next: NextFunction
): void => {
	const token = req.cookies?.access_token;

	if (token) {
		try {
			req.user = verifyAccessToken(token);
		} catch {
			// Token invalid or expired, continue without user
		}
	}

	next();
};
