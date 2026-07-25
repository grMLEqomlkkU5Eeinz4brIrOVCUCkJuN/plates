import { randomBytes } from "node:crypto";

/**
 * Runs before any module under test loads (jest `setupFiles`). Without
 * this, importing app.ts pulls in config/env.ts, whose zod schema requires
 * JWT/cookie/CSRF secrets that don't exist until a real .env is created.
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET ??= randomBytes(32).toString("base64url");
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString("base64url");
process.env.COOKIE_SECRET ??= randomBytes(32).toString("base64url");
process.env.CSRF_SECRET ??= randomBytes(32).toString("base64url");
