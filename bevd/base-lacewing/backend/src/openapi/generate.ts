import { writeFileSync } from "node:fs";
import { buildOpenApiDocument } from "./index";

/** The committed copy, beside package.json. The tests fail when it is stale. */
export const OPENAPI_PATH = new URL("../../openapi.json", import.meta.url).pathname;

export function renderOpenApi(): string {
	return `${JSON.stringify(buildOpenApiDocument(), null, "\t")}\n`;
}

// `bun run openapi`. It imports the services, so it needs the same environment the server
// does - Bun reads it from .env.
if (import.meta.main) {
	writeFileSync(OPENAPI_PATH, renderOpenApi());
}
