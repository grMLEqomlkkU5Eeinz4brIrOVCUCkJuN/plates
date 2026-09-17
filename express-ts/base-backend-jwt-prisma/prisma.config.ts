import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 does not read .env files, and this template does not carry dotenv:
 * `npm run dev` and `npm start` hand the file to Node itself with
 * `--env-file-if-exists`. The CLI gets the same treatment here through Node's
 * own loader, keyed on NODE_ENV the same way, so `npx prisma migrate dev` sees
 * the DATABASE_URL the app does and `NODE_ENV=test npx prisma migrate deploy`
 * migrates the database the suite runs against. A real environment variable
 * still wins: loadEnvFile does not overwrite what is already set.
 */
const envFile = `.env.${process.env.NODE_ENV ?? "development"}`;

if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
	schema: "prisma/schema.prisma",
	migrations: {
		path: "prisma/migrations",
	},
	datasource: {
		// Read straight from the environment rather than through prisma/config's
		// env() helper: that one throws the moment the variable is missing, which
		// turns `prisma generate` - a command that never opens a connection - into
		// a failure during `npm install` and in the Docker build.
		url: process.env.DATABASE_URL,
	},
});
