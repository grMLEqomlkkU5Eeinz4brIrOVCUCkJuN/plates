import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildOpenApiDocument } from "../openapi";

/** Committed, so a client can be generated without running the service. */
export const OPENAPI_PATH = join(__dirname, "../../openapi.json");

export const renderOpenApi = (): string =>
	`${JSON.stringify(buildOpenApiDocument(), null, "\t")}\n`;

// The freshness test imports this module and must not write the file.
if (require.main === module) {
	writeFileSync(OPENAPI_PATH, renderOpenApi());
}
