import { writeFileSync } from "node:fs";
import { buildOpenApiDocument } from "../openapi";

/** Committed, so a client generator or a reviewer can read the API without booting it. */
export const OPENAPI_PATH = new URL("../../openapi.json", import.meta.url).pathname;

export const renderOpenApiDocument = (): string =>
	`${JSON.stringify(buildOpenApiDocument(), null, "\t")}\n`;

if (import.meta.main) {
	writeFileSync(OPENAPI_PATH, renderOpenApiDocument());
}
