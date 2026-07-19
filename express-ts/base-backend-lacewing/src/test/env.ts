import { randomBytes } from "node:crypto";

/**
 * Runs before any module under test loads (jest `setupFiles`). The secrets
 * are random per run because lacewing's importKey would refuse a hardcoded
 * "test-secret" string - the entropy check has no test-mode bypass.
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET ??= randomBytes(32).toString("base64url");
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString("base64url");
process.env.COOKIE_SECRET ??= randomBytes(32).toString("base64url");
process.env.CSRF_SECRET ??= randomBytes(32).toString("base64url");
