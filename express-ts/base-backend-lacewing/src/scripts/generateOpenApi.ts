import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildOpenApiDocument } from "../openapi";

export const openApiPath = resolve(__dirname, "../../openapi.json");

export const renderOpenApi = (): string =>
	`${JSON.stringify(buildOpenApiDocument(), null, "\t")}\n`;

// `npm run openapi`. The test imports this file for the two exports above.
if (require.main === module) {
	writeFileSync(openApiPath, renderOpenApi());
}
