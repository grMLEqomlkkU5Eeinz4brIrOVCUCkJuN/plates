import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildOpenApiDocument } from "../openapi";

export const OPENAPI_PATH = resolve(__dirname, "../../openapi.json");

export const renderOpenApi = (): string =>
	`${JSON.stringify(buildOpenApiDocument(), null, "\t")}\n`;

if (require.main === module) {
	writeFileSync(OPENAPI_PATH, renderOpenApi());
}
