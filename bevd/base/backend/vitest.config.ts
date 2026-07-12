import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		// Tests never touch the docker-compose database - they run against PGlite,
		// an in-process Postgres. These values only exist to satisfy env validation.
		env: {
			NODE_ENV: "test",
			PORT: "3000",
			GRPC_PORT: "50051",
			// The logging middleware still runs, it just does not print. Set this to
			// "debug" when a test fails and you want to see what the server saw.
			LOG_LEVEL: "silent",
			SERVICE_NAME: "bevd-backend-test",
			DATABASE_URL: "postgres://unused:unused@localhost:5432/unused",
			CORS_ORIGIN: "http://localhost:5173",
		},
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.test.ts", "src/test/**", "src/db/seed.ts"],
		},
	},
});
