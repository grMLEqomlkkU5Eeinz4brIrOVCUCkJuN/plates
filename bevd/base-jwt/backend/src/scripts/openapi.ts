import { writeFileSync } from "node:fs";
import { logger } from "../lib/logger";
import { buildOpenApiDocument } from "../openapi";

/**
 * `bun run openapi` writes the committed openapi.json. A test compares the file with
 * renderOpenApiDocument(), so a route change that forgets to regenerate fails CI.
 *
 * Needs the same .env as the app: the area files import the services' input schemas, and
 * the services import auth/jwt, which validates the environment on load. Nothing in the
 * document depends on its values.
 */
export const OPENAPI_PATH = new URL("../../openapi.json", import.meta.url).pathname;

export const renderOpenApiDocument = (): string =>
	`${JSON.stringify(buildOpenApiDocument(), null, "\t")}\n`;

if (import.meta.main) {
	writeFileSync(OPENAPI_PATH, renderOpenApiDocument());
	logger.info({ path: OPENAPI_PATH }, "openapi.json written");
}
