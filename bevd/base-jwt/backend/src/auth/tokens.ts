import { createHash, randomBytes } from "node:crypto";
import { env } from "../config/env";

/**
 * Refresh tokens are opaque random strings, not JWTs - there is nothing to decode and
 * nothing to forge. The database stores only the SHA-256 of the token, the same way a
 * password is stored: whoever reads the table cannot use what they find.
 *
 * SHA-256 is right here (unlike for passwords, which need argon2): the input is 256 bits
 * of entropy, so there is no dictionary to run against it and nothing to slow down.
 */
export function generateRefreshToken(): string {
	return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

/**
 * How long a freshly minted refresh token is good for.
 *
 * The lifetime is configuration, so reading it lives here rather than in the service.
 * Services take a ServiceCtx and their input, and nothing else - no service in this
 * codebase imports `env`, which is what keeps them callable from a test, a script or a
 * transport without a boot-time environment behind them.
 */
export function refreshTokenExpiresAt(now = Date.now()): Date {
	return new Date(now + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}
