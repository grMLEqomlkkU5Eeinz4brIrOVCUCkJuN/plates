// Importing an area file registers its routes, so every area must be imported here. The
// order is the order the document lists them in.
import "./paths/health";
import "./paths/post";

export { buildOpenApiDocument } from "./document";
export { describedRoutes } from "./registry";
