import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		// Tests never touch the docker-compose database - they run against PGlite, an
		// in-process Postgres. These values only exist to satisfy env validation.
		env: {
			NODE_ENV: "test",
			PORT: "3000",
			GRPC_PORT: "50051",
			// The logging middleware still runs, it just does not print. Set this to
			// "debug" when a test fails and you want to see what the server saw.
			LOG_LEVEL: "silent",
			SERVICE_NAME: "bevd-jwt-backend-test",
			DATABASE_URL: "postgres://unused:unused@localhost:5432/unused",
			CORS_ORIGIN: "http://localhost:5173",
			// A throwaway signing key. The real one lives in .env and never in git.
			JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
			JWT_ACCESS_EXPIRY: "15m",
			REFRESH_TOKEN_TTL_DAYS: "7",
			COOKIE_SECURE: "false",
			COOKIE_SAME_SITE: "lax",
		},
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.test.ts", "src/test/**", "src/db/seed.ts"],
		},
	},
});
