import { Request, Response, NextFunction, CookieOptions } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { durationToSeconds } from "../utils/helpers";
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

// Derived from the token lifetimes rather than restated, so a cookie cannot be
// discarded while the token it carries is still valid - which is what a
// hand-synced literal does the first time somebody changes JWT_ACCESS_EXPIRY and
// not this line. res.cookie wants milliseconds; the tokens are configured in
// duration strings.
const ACCESS_MAX_AGE_MS = durationToSeconds(env.JWT_ACCESS_EXPIRY) * 1000;
const REFRESH_MAX_AGE_MS = durationToSeconds(env.JWT_REFRESH_EXPIRY) * 1000;

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
		maxAge: ACCESS_MAX_AGE_MS,
	});

	res.cookie("refresh_token", refreshToken, {
		...cookieOptions,
		maxAge: REFRESH_MAX_AGE_MS,
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
