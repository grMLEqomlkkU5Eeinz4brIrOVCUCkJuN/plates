import { jwtVerify, SignJWT } from "jose";
import { env } from "../config/env";
import type { UserRole } from "../db/schema";
import { AppError } from "./errors";

const secret = new TextEncoder().encode(env.JWT_SECRET);

const ALGORITHM = "HS256";

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
		.sign(secret);
}

/**
 * Throws UNAUTHORIZED on anything suspect - bad signature, expired, wrong algorithm.
 *
 * `algorithms` is not optional: without it a token can declare its own `alg`, and the
 * classic JWT attack is to hand the verifier `alg: none` or swap HMAC for RSA.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
	try {
		const { payload } = await jwtVerify(token, secret, { algorithms: [ALGORITHM] });

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
