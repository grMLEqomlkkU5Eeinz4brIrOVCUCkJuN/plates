import { writeFileSync } from "node:fs";
import { buildOpenApiDocument } from "../openapi";

/**
 * `bun run openapi` writes the committed openapi.json. A test compares the file with
 * renderOpenApiDocument(), so a route change that forgets to regenerate fails CI.
 *
 * Runs with no .env, so CI and a fresh clone can generate it: nothing on this import path
 * reaches config/env (the input schemas live in models/, not in the services). A test
 * runs it in an empty environment to keep it that way.
 */
export const OPENAPI_PATH = new URL("../../openapi.json", import.meta.url).pathname;

export const renderOpenApiDocument = (): string =>
	`${JSON.stringify(buildOpenApiDocument(), null, "\t")}\n`;

if (import.meta.main) {
	writeFileSync(OPENAPI_PATH, renderOpenApiDocument());
	// Not the app logger: that one validates the environment this script must not need.
	process.stdout.write(`wrote ${OPENAPI_PATH}\n`);
}
