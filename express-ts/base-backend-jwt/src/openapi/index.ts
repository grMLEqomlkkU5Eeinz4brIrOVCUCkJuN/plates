// Importing an area file registers its routes; the order here is the order the
// document lists them in.
import "./paths/health";
import "./paths/auth";
import "./paths/users";

export { describedRoutes } from "./registry";
export { API_PREFIX, buildOpenApiDocument } from "./document";
