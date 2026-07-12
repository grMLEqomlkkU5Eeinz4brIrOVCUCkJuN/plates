import { type } from "arktype";

const Env = type({
	NODE_ENV: "'development' | 'test' | 'production'",
	PORT: "1 <= number <= 65535",
	GRPC_PORT: "1 <= number <= 65535",
	LOG_LEVEL: "'debug' | 'info' | 'warn' | 'error' | 'silent'",
	// Tags every log line, so one stream can carry more than one service.
	SERVICE_NAME: "string > 0",
	DATABASE_URL: "string > 0",
	CORS_ORIGIN: "string > 0",

	// 32 characters is not decoration: an HS256 key shorter than the hash it feeds is
	// the weak link. The app refuses to boot rather than sign tokens with a short one.
	JWT_SECRET: "string >= 32",
	// Anything jose accepts: "15m", "1h", "7d".
	JWT_ACCESS_EXPIRY: "string > 0",
	REFRESH_TOKEN_TTL_DAYS: "1 <= number <= 365",

	// Cookies must be Secure in production; over plain http in dev the browser drops them.
	COOKIE_SECURE: "boolean",
	COOKIE_SAME_SITE: "'lax' | 'strict' | 'none'",
});

// Defaults are applied before validation so the schema stays a plain shape check -
// no morphs, no surprises about whether a default is validated as input or output.
const result = Env({
	NODE_ENV: process.env.NODE_ENV ?? "development",
	PORT: Number(process.env.PORT ?? 3000),
	GRPC_PORT: Number(process.env.GRPC_PORT ?? 50051),
	LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
	SERVICE_NAME: process.env.SERVICE_NAME ?? "bevd-jwt-backend",
	DATABASE_URL: process.env.DATABASE_URL ?? "",
	CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:5173",
	JWT_SECRET: process.env.JWT_SECRET ?? "",
	JWT_ACCESS_EXPIRY: process.env.JWT_ACCESS_EXPIRY ?? "15m",
	REFRESH_TOKEN_TTL_DAYS: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 7),
	COOKIE_SECURE: process.env.COOKIE_SECURE === "true",
	COOKIE_SAME_SITE: process.env.COOKIE_SAME_SITE ?? "lax",
});

if (result instanceof type.errors) {
	throw new Error(
		`Invalid environment:\n${result.summary}\n\nDid you copy .env.example to .env?`,
	);
}

export const env = result;
export type Env = typeof env;
