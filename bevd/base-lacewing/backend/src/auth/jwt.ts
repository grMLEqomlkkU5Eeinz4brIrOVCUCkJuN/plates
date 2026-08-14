import { accessTokenProfile, importKey, JWTError, jwtVerify, newAccessToken } from "lacewing";
import { env } from "../config/env";
import type { UserRole } from "../db/schema";
import { AppError } from "../lib/errors";

/**
 * Access tokens through lacewing, which turns the checklist the old jose
 * version had to get right by hand into things that cannot be gotten wrong:
 * the algorithm allowlist, issuer and audience pinning, a `typ` of `at+jwt`
 * (RFC 9068) that a differently-purposed token can never satisfy, a unique
 * `jti` on every token, and an entropy check on the secret itself - a
 * human-chosen JWT_SECRET refuses to import, so the app fails on the first
 * token rather than at audit time.
 *
 * (Refresh tokens are deliberately not JWTs - see tokens.ts.)
 */
interface Keys {
	key: Awaited<ReturnType<typeof importKey>>;
	profile: ReturnType<typeof accessTokenProfile>;
}

let keys: Promise<Keys> | undefined;

/**
 * Imported on first use, not at import time.
 *
 * This file used to do a top-level `await importKey(env.JWT_SECRET, "HS256")`, which meant
 * that merely *importing* a router - or anything that transitively reaches this file - ran
 * key derivation and lacewing's entropy check. A weak secret failed at import, so a test
 * that never signs a token still needed a real random one, and every importer paid for
 * crypto it might not use.
 *
 * Deferring it moves that failure to the first sign or verify, which is where it belongs
 * and where it is still impossible to miss. Caching the promise keeps the single-import
 * guarantee: concurrent callers await the same one.
 *
 * Note what this does *not* defer: `env` itself is still validated when config/env.ts is
 * imported, and deliberately so - a missing DATABASE_URL should stop the process at boot,
 * not on the first query. Config is validated eagerly; key material is derived lazily.
 */
function load(): Promise<Keys> {
	keys ??= (async () => {
		const key = await importKey(env.JWT_SECRET, "HS256");

		return {
			key,
			profile: accessTokenProfile({
				issuer: env.JWT_ISSUER,
				audience: env.JWT_AUDIENCE,
				algorithms: ["HS256"],
				keys: key,
				maxTokenAge: env.JWT_ACCESS_EXPIRY,
			}),
		};
	})();

	return keys;
}

export interface AccessTokenPayload {
	/** The user id. `sub` is the registered JWT claim for it. */
	sub: string;
	email: string;
	role: UserRole;
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
	const { key } = await load();

	return newAccessToken()
		.issuer(env.JWT_ISSUER)
		.audience(env.JWT_AUDIENCE)
		.subject(payload.sub)
		.claim("email", payload.email)
		.claim("role", payload.role)
		.expiresIn(env.JWT_ACCESS_EXPIRY)
		.sign(key);
}

/**
 * Throws UNAUTHORIZED on anything suspect. jwtVerify(token, profile) is the
 * only verification path lacewing has: there is no decode-without-verify to
 * reach for, `alg: none` is unrepresentable, and the classic HMAC/RSA swap
 * fails the allowlist. One message for every failure mode, on purpose - the
 * caller gets no oracle for *why* a token was rejected.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
	try {
		const { profile } = await load();
		const { payload } = await jwtVerify(token, profile);

		const { sub, email, role } = payload;

		if (typeof sub !== "string" || typeof email !== "string" || typeof role !== "string") {
			throw new AppError("UNAUTHORIZED", "Malformed access token");
		}

		return { sub, email, role: role as UserRole };
	} catch (error) {
		if (error instanceof AppError) throw error;
		if (error instanceof JWTError) {
			throw new AppError("UNAUTHORIZED", "Invalid or expired access token");
		}

		throw error;
	}
}
