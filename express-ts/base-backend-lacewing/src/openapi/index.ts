// Importing an area registers its routes; the order here is the document's order.
import "./paths/health";
import "./paths/auth";
import "./paths/users";

export { describedRoutes } from "./registry";
export { buildOpenApiDocument } from "./document";
