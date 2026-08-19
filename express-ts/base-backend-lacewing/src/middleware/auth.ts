import { Request, Response, NextFunction } from "express";
import {
	newAccessToken,
	newRefreshToken,
	jwtVerify,
	buildTokenCookie,
	clearTokenCookie,
	readTokenCookie,
	parseBearer,
	JWTError,
	JWTExpired,
	JWTRevoked,
	type JwtPayLoad,
} from "lacewing";
import { env } from "../config/env";
import { durationToSeconds } from "../utils/helpers";
import { authKit, REFRESH_AUDIENCE } from "../config/lacewing";
import { createError } from "./errorHandler";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";
export const REFRESH_PATH = "/api/v1/auth/refresh";

// Derived from the token lifetimes rather than restated, so the cookie cannot
// outlive the token it carries - or, worse, be discarded while the token is
// still valid, which is what a hand-synced literal does the first time somebody
// changes JWT_ACCESS_EXPIRY and not this line.
const ACCESS_MAX_AGE = durationToSeconds(env.JWT_ACCESS_EXPIRY);
const REFRESH_MAX_AGE = durationToSeconds(env.JWT_REFRESH_EXPIRY);

// lacewing spells SameSite the way the header does.
const SAME_SITE = env.COOKIE_SAME_SITE === "strict" ? "Strict" : "Lax";

export interface AuthUser {
	userId: string;
	email: string;
	/** The token's unique id - what revocation acts on. */
	jti: string;
	/** Unix seconds; a revocation only needs to be remembered until then. */
	exp: number;
}

export interface TokenClaims {
	userId: string;
	email: string;
}

/** Narrow a verified payload to the claims this app signs into every token. */
const toAuthUser = (payload: JwtPayLoad): AuthUser => {
	const { sub, jti, exp, email } = payload;
	if (
		typeof sub !== "string" ||
		typeof jti !== "string" ||
		typeof email !== "string"
	) {
		throw createError(401, "Malformed token payload");
	}
	return { userId: sub, email, jti, exp };
};

export const generateAccessToken = async (
	claims: TokenClaims
): Promise<string> => {
	const { accessKey } = await authKit();
	// newAccessToken() pins typ to "at+jwt" and caps the lifetime at 1h.
	return newAccessToken()
		.issuer(env.JWT_ISSUER)
		.audience(env.JWT_AUDIENCE)
		.subject(claims.userId)
		.claim("email", claims.email)
		.expiresIn(env.JWT_ACCESS_EXPIRY)
		.sign(accessKey);
};

export const generateRefreshToken = async (
	claims: TokenClaims
): Promise<string> => {
	const { refreshKey } = await authKit();
	// typ "rt+jwt" and the refresh-only audience make this token useless
	// against the API profile, even though it carries the same claims.
	return newRefreshToken()
		.issuer(env.JWT_ISSUER)
		.audience(REFRESH_AUDIENCE)
		.subject(claims.userId)
		.claim("email", claims.email)
		.expiresIn(env.JWT_REFRESH_EXPIRY)
		.sign(refreshKey);
};

export const verifyAccessToken = async (token: string): Promise<AuthUser> => {
	const { accessProfile } = await authKit();
	const { payload } = await jwtVerify(token, accessProfile);
	return toAuthUser(payload);
};

export const verifyRefreshToken = async (token: string): Promise<AuthUser> => {
	const { refreshProfile } = await authKit();
	const { payload } = await jwtVerify(token, refreshProfile);
	return toAuthUser(payload);
};

/** Revoke by jti; jwtVerify consults the store after every other check passes. */
export const revokeToken = async (
	token: Pick<AuthUser, "jti" | "exp">
): Promise<void> => {
	const { revocation } = await authKit();
	revocation.revoke(token.jti, token.exp);
};

/**
 * buildTokenCookie always emits HttpOnly; Secure; SameSite - there is no
 * option to weaken that, which is why this template has no COOKIE_SECURE
 * switch. Browsers treat http://localhost as a secure context, so dev works.
 *
 * COOKIE_DOMAIN is host-only when unset, and config/env.ts says when to set it.
 * clearAuthCookies passes the same value: a cookie is identified by name,
 * domain and path together, so a clear that omits the domain expires a cookie
 * the browser does not have and leaves the session where it was.
 */
export const setAuthCookies = (
	res: Response,
	accessToken: string,
	refreshToken: string
): void => {
	res.append(
		"Set-Cookie",
		buildTokenCookie(accessToken, {
			name: ACCESS_COOKIE,
			sameSite: SAME_SITE,
			domain: env.COOKIE_DOMAIN,
			maxAgeSeconds: ACCESS_MAX_AGE,
		})
	);
	res.append(
		"Set-Cookie",
		buildTokenCookie(refreshToken, {
			name: REFRESH_COOKIE,
			sameSite: SAME_SITE,
			domain: env.COOKIE_DOMAIN,
			maxAgeSeconds: REFRESH_MAX_AGE,
			// Only ever sent to the refresh endpoint.
			path: REFRESH_PATH,
		})
	);
};

export const clearAuthCookies = (res: Response): void => {
	// lacewing's cookie helpers write to a WHATWG Headers object; Express
	// does not expose one, so collect and copy.
	const headers = new Headers();
	clearTokenCookie(headers, {
		name: ACCESS_COOKIE,
		domain: env.COOKIE_DOMAIN,
	});
	clearTokenCookie(headers, {
		name: REFRESH_COOKIE,
		path: REFRESH_PATH,
		domain: env.COOKIE_DOMAIN,
	});
	for (const cookie of headers.getSetCookie()) {
		res.append("Set-Cookie", cookie);
	}
};

/**
 * Cookie first (browsers), strict RFC 6750 bearer parsing as the fallback
 * (curl, other services). parseBearer rejects anything that is not exactly
 * one well-formed `Bearer <token>` - no query-string tokens, ever.
 */
const extractAccessToken = (req: Request): string | undefined => {
	const fromCookie = readTokenCookie(req.headers.cookie, ACCESS_COOKIE);
	if (fromCookie) return fromCookie;
	if (req.headers.authorization)
		return parseBearer(req.headers.authorization);

	// readTokenCookie hands back undefined for a name that arrived twice: nothing
	// settles which copy wins, so it refuses to guess rather than return one an
	// attacker on a sibling subdomain may have planted. Still a 401, with a
	// message that tells the two apart in the log, because "nobody is logged in"
	// and "somebody is writing cookies on our domain" want different responses.
	if (countCookie(req.headers.cookie, ACCESS_COOKIE) > 1) {
		throw createError(401, "Ambiguous access token cookie");
	}

	return undefined;
};

const countCookie = (header: string | undefined, name: string): number => {
	if (!header) return 0;

	return header
		.split(";")
		.filter((pair) => pair.slice(0, pair.indexOf("=")).trim() === name)
		.length;
};

export const authenticate = async (
	req: Request,
	_res: Response,
	next: NextFunction
): Promise<void> => {
	try {
		const token = extractAccessToken(req);
		if (!token) throw createError(401, "Access token required");

		req.user = await verifyAccessToken(token);
		next();
	} catch (error) {
		if (error instanceof JWTExpired)
			throw createError(401, "Access token expired");
		if (error instanceof JWTRevoked)
			throw createError(401, "Access token revoked");
		// Any other lacewing rejection - bad signature, wrong typ, wrong
		// audience, malformed bearer header - is a plain 401. No oracle.
		if (error instanceof JWTError)
			throw createError(401, "Invalid access token");
		throw error;
	}
};

export const optionalAuth = async (
	req: Request,
	_res: Response,
	next: NextFunction
): Promise<void> => {
	try {
		const token = extractAccessToken(req);
		if (token) req.user = await verifyAccessToken(token);
	} catch {
		// Token invalid, expired or revoked - continue anonymously.
	}
	next();
};
