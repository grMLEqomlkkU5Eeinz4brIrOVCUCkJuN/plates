import { jwtVerify, SignJWT } from "jose";
import { env } from "../config/env";
import type { UserRole } from "../db/schema";
import { AppError } from "../lib/errors";

const ALGORITHM = "HS256";

/**
 * The signing key, derived on first use rather than at import time.
 *
 * Encoding the secret in module scope meant every importer of this file - a router, a
 * type-only consumer, a test that never signs anything - did the work as a side effect of
 * the import. Deferring it keeps that cost, and any failure derived from the secret, at
 * the first sign or verify. The lacewing template makes the same move for a sharper
 * reason: there the import runs an entropy check that can reject the secret outright.
 *
 * Note what this does *not* defer: `env` itself is still validated when config/env.ts is
 * imported, and deliberately so - a missing DATABASE_URL should stop the process at boot,
 * not on the first query. Config is validated eagerly; key material is derived lazily.
 */
let secret: Uint8Array | undefined;

function key(): Uint8Array {
	secret ??= new TextEncoder().encode(env.JWT_SECRET);

	return secret;
}

export interface AccessTokenPayload {
	/** The user id. `sub` is the registered JWT claim for it. */
	sub: string;
	email: string;
	role: UserRole;
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
	return new SignJWT({ email: payload.email, role: payload.role })
		.setProtectedHeader({ alg: ALGORITHM })
		.setSubject(payload.sub)
		.setIssuedAt()
		.setExpirationTime(env.JWT_ACCESS_EXPIRY)
		.sign(key());
}

/**
 * Throws UNAUTHORIZED on anything suspect - bad signature, expired, wrong algorithm.
 *
 * `algorithms` is not optional: without it a token can declare its own `alg`, and the
 * classic JWT attack is to hand the verifier `alg: none` or swap HMAC for RSA.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
	try {
		const { payload } = await jwtVerify(token, key(), { algorithms: [ALGORITHM] });

		const { sub, email, role } = payload as Record<string, unknown>;

		if (typeof sub !== "string" || typeof email !== "string" || typeof role !== "string") {
			throw new AppError("UNAUTHORIZED", "Malformed access token");
		}

		return { sub, email, role: role as UserRole };
	} catch (error) {
		if (error instanceof AppError) throw error;

		throw new AppError("UNAUTHORIZED", "Invalid or expired access token");
	}
}
