import { Request, Response, NextFunction, CookieOptions } from "express";
import { env } from "../config/env";
import { httpError } from "./errorHandler";
import {
	ACCESS_TTL_SECONDS,
	REFRESH_TTL_SECONDS,
	verifyAccessToken,
} from "../services/token.service";

export interface AuthContext {
	userId: string;
	/** The refresh-token family this access token was minted for. */
	sessionId: string;
}

// Derived from the token lifetimes rather than restated, so a cookie cannot be
// discarded while the token it carries is still valid, which is what a
// hand-synced literal does the first time somebody changes JWT_ACCESS_EXPIRY
// and not this line. res.cookie wants milliseconds.
const ACCESS_MAX_AGE_MS = ACCESS_TTL_SECONDS * 1000;
const REFRESH_MAX_AGE_MS = REFRESH_TTL_SECONDS * 1000;

// A cookie is identified by name, domain and path together, so clearAuthCookies
// has to name the domain setAuthCookies used or the browser keeps the cookie and
// logout does nothing. One shared object is what stops the two from drifting.
const cookieOptions = {
	httpOnly: true,
	secure: env.COOKIE_SECURE,
	sameSite: env.COOKIE_SAME_SITE,
	domain: env.COOKIE_DOMAIN,
} as const satisfies CookieOptions;

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

/** The refresh cookie travels only to the endpoint that spends it, so a
 *  stolen page on any other path never sees the long-lived credential. */
const REFRESH_COOKIE_PATH = "/api/v1/auth/refresh";

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
const readAccessCookie = (req: Request): string | undefined => {
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
	res.cookie(ACCESS_COOKIE, accessToken, {
		...cookieOptions,
		maxAge: ACCESS_MAX_AGE_MS,
	});

	res.cookie(REFRESH_COOKIE, refreshToken, {
		...cookieOptions,
		maxAge: REFRESH_MAX_AGE_MS,
		path: REFRESH_COOKIE_PATH,
	});
};

export const clearAuthCookies = (res: Response): void => {
	res.clearCookie(ACCESS_COOKIE, cookieOptions);
	res.clearCookie(REFRESH_COOKIE, {
		...cookieOptions,
		path: REFRESH_COOKIE_PATH,
	});
};

/**
 * Verifies the access cookie and nothing else.
 *
 * There is no database read on this path: it is the cost every
 * authenticated request pays. What that gives up is instant revocation, and
 * the fifteen-minute lifetime plus the refresh-time checks in auth.service are
 * what pay for it. A handler that cannot wait fifteen minutes (closing the
 * account, say) reads the row itself through user.service.
 */
export const authenticate = (
	req: Request,
	_res: Response,
	next: NextFunction
): void => {
	const token = readAccessCookie(req);

	if (!token) {
		throw httpError(401, "Sign in to do that.", { errorCode: "UNAUTHENTICATED" });
	}

	const claims = verifyAccessToken(token);

	req.auth = { userId: claims.sub, sessionId: claims.sid };
	next();
};

/** The identity for the current request, once authenticate has run. */
export const authOf = (req: Request): AuthContext => {
	if (!req.auth) {
		throw new Error("authenticate must run before the handler that reads req.auth.");
	}
	return req.auth;
};
