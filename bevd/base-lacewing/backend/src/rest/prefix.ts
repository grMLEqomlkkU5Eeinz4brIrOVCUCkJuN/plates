// Its own module so src/openapi can name the REST paths without importing the routes,
// which reach config/env through the services.
export const REST_PREFIX = "/api/v1";
