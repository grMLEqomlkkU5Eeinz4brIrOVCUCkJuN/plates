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

/**
 * config/env.ts insists on a connection string; nothing in the suite opens the
 * connection. The route tests swap src/db/prisma for the in-memory fake in
 * src/db/__mocks__, and the tests that do not still never issue a query, so the
 * pool this URL describes is built and never dialled.
 */
process.env.DATABASE_URL ??=
	"postgresql://postgres:postgres@localhost:5432/jwt_prisma_backend_test?schema=public";
