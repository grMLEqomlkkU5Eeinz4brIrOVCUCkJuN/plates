import { writeFileSync } from "fs";
import path from "path";
import { buildOpenApiDocument } from "../openapi";

export const openApiPath = path.resolve(__dirname, "../../openapi.json");

export const renderedOpenApi = `${JSON.stringify(buildOpenApiDocument(), null, "\t")}\n`;

if (require.main === module) {
	writeFileSync(openApiPath, renderedOpenApi);
}
