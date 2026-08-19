import { Request, Response, NextFunction } from "express";
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
): string => {
	return jwt.sign(payload, env.JWT_SECRET, {
		expiresIn: env.JWT_ACCESS_EXPIRY as jwt.SignOptions["expiresIn"],
	});
};

export const generateRefreshToken = (
	payload: Omit<JwtPayload, "iat" | "exp">
): string => {
	return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
		expiresIn: env.JWT_REFRESH_EXPIRY as jwt.SignOptions["expiresIn"],
	});
};

export const verifyAccessToken = (token: string): JwtPayload => {
	return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
};

export const verifyRefreshToken = (token: string): JwtPayload => {
	return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
};

// A cookie is identified by name, domain and path together, so setting and
// clearing have to name the same attributes or logout expires a cookie the
// browser does not have and leaves the real one in place. One object, read by
// both, is what keeps them from drifting.
const cookieOptions = {
	httpOnly: true,
	secure: env.COOKIE_SECURE,
	sameSite: env.COOKIE_SAME_SITE as "strict" | "lax" | "none",
	domain: env.COOKIE_DOMAIN,
};

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

/**
 * Nothing settles whether the first or the last `access_token=` wins when a
 * header carries two, so a parser that picks one is guessing, and cookie-parser
 * (which fills req.cookies) picks the first. An attacker who can write a cookie
 * on this domain (a sibling subdomain, a cookie-injection bug) tosses in a
 * second one whose value they know and hopes the guess goes their way. An
 * ambiguous name is refused instead: no session rather than possibly theirs.
 * The legitimate user is refused too while the extra cookie is in place, which
 * is the trade worth making.
 *
 * COOKIE_DOMAIN makes this reachable by design, because a cookie scoped to a
 * parent is one every subdomain under it can also write.
 */
export const readAccessCookie = (req: Request): string | undefined => {
	const header = req.headers.cookie;

	if (!header) return undefined;

	let found: string | undefined;

	for (const pair of header.split(";")) {
		const eq = pair.indexOf("=");

		if (eq === -1 || pair.slice(0, eq).trim() !== ACCESS_COOKIE) continue;
		if (found !== undefined) return undefined;

		found = pair.slice(eq + 1).trim();
	}

	return found || undefined;
};

export const setAuthCookies = (
	res: Response,
	accessToken: string,
	refreshToken: string
): void => {
	// Derived from the token lifetimes rather than restated, so a cookie cannot be
	// discarded while the token it carries is still valid - which is what a
	// hand-synced literal does the first time somebody changes JWT_ACCESS_EXPIRY and
	// not this line. res.cookie wants milliseconds; the tokens are configured in
	// duration strings.
	const ACCESS_MAX_AGE_MS = durationToSeconds(env.JWT_ACCESS_EXPIRY) * 1000;
	const REFRESH_MAX_AGE_MS = durationToSeconds(env.JWT_REFRESH_EXPIRY) * 1000;

	res.cookie(ACCESS_COOKIE, accessToken, {
		...cookieOptions,
		maxAge: ACCESS_MAX_AGE_MS,
	});

	res.cookie(REFRESH_COOKIE, refreshToken, {
		...cookieOptions,
		maxAge: REFRESH_MAX_AGE_MS,
		path: "/api/v1/auth/refresh",
	});
};

export const clearAuthCookies = (res: Response): void => {
	res.clearCookie(ACCESS_COOKIE, cookieOptions);
	res.clearCookie(REFRESH_COOKIE, {
		...cookieOptions,
		path: "/api/v1/auth/refresh",
	});
};

export const authenticate = (
	req: Request,
	_res: Response,
	next: NextFunction
): void => {
	const token = readAccessCookie(req);

	if (!token) {
		throw createError(401, "Access token required");
	}

	try {
		const payload = verifyAccessToken(token);
		req.user = payload;
		next();
	} catch (error) {
		if (error instanceof jwt.TokenExpiredError) {
			throw createError(401, "Access token expired");
		}
		if (error instanceof jwt.JsonWebTokenError) {
			throw createError(401, "Invalid access token");
		}
		throw error;
	}
};

export const optionalAuth = (
	req: Request,
	_res: Response,
	next: NextFunction
): void => {
	const token = readAccessCookie(req);

	if (token) {
		try {
			const payload = verifyAccessToken(token);
			req.user = payload;
		} catch {
			// Token invalid or expired, continue without user
		}
	}

	next();
};
