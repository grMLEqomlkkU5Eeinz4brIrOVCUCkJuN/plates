import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import { env } from "../config/env";
import { durationToSeconds } from "../utils/helpers";
import { httpError, type HttpError } from "../middleware/errorHandler";

/**
 * Two kinds of token.
 *
 * The access token is a JWT: it is verified on every request without a
 * database read, which is what keeps the authenticated path free, and it is
 * why the lifetime is short. Revoking a session takes effect when the access
 * token expires, and immediately for anything that refreshes.
 *
 * The refresh token is not a JWT. It is 256 bits from the CSPRNG, stored only
 * as a SHA-256 hash, single use, and rotated on every refresh (auth.service).
 * It carries no claims, so nothing about it can be trusted without its row,
 * which is the point: the row is what gets spent, revoked and expired.
 */

export const ACCESS_TTL_SECONDS = durationToSeconds(env.JWT_ACCESS_EXPIRY);
export const REFRESH_TTL_SECONDS = durationToSeconds(env.REFRESH_TOKEN_EXPIRY);

export interface AccessTokenClaims {
	/** users.id */
	sub: string;
	/** refresh_tokens.family_id: the session this token belongs to. */
	sid: string;
}

export const signAccessToken = (claims: AccessTokenClaims): string =>
	jwt.sign({ sub: claims.sub, sid: claims.sid }, env.JWT_SECRET, {
		algorithm: "HS256",
		expiresIn: ACCESS_TTL_SECONDS,
	});

const tokenError = (message: string, expired = false): HttpError =>
	httpError(401, message, {
		errorCode: expired ? "TOKEN_EXPIRED" : "TOKEN_INVALID",
	});

/**
 * `algorithms` is pinned so a token claiming `alg: none` or `alg: RS256` is
 * rejected rather than verified against the HMAC secret as a public key.
 */
export const verifyAccessToken = (token: string): AccessTokenClaims => {
	let payload: jwt.JwtPayload | string;

	try {
		payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
	} catch (error) {
		throw error instanceof jwt.TokenExpiredError
			? tokenError("Access token has expired.", true)
			: tokenError("Access token is not valid.");
	}

	if (typeof payload === "string" || typeof payload.sub !== "string" || typeof payload.sid !== "string") {
		throw tokenError("Access token is missing required claims.");
	}

	return { sub: payload.sub, sid: payload.sid };
};

export const generateRefreshToken = (): { token: string; hash: string } => {
	const token = randomBytes(32).toString("base64url");
	return { token, hash: hashRefreshToken(token) };
};

export const hashRefreshToken = (token: string): string =>
	createHash("sha256").update(token).digest("hex");
