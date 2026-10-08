import { type } from "arktype";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/**
 * bearer:   needs a signed-in caller: the access_token cookie, or `Authorization: Bearer`.
 * optional: anyone; a session changes what comes back (your own drafts appear).
 * refresh:  needs the refresh_token cookie and nothing else.
 * open:     needs nothing.
 */
export type Access = "bearer" | "optional" | "refresh" | "open";

export interface ApiResponse {
	description: string;
	/** The value the handler returns. Omit for a response with no body. */
	schema?: type.Any;
}

export interface ApiRoute {
	method: HttpMethod;
	/** The full Elysia route pattern, prefix included: `/api/v1/posts/:id`. */
	path: string;
	/** Becomes the generated client's method name. Must be unique across the document. */
	operationId: string;
	summary: string;
	description?: string;
	tags: readonly string[];
	access: Access;
	/** The tRPC procedure this route mirrors: same service call, same input schema. */
	procedure?: string;
	/** The very schema objects the route validates with, never copies. */
	request?: {
		params?: type.Any;
		query?: type.Any;
		body?: type.Any;
	};
	/** By status code. A string describes an error status, which has the shared Error body. */
	responses: Record<number, ApiResponse | string>;
}

const routes: ApiRoute[] = [];
const components = new Map<string, type.Any>();

/** Called once per area file, at import time. */
export const describeRoutes = (list: readonly ApiRoute[]): void => {
	routes.push(...list);
};

export const describedRoutes = (): readonly ApiRoute[] => routes;

/**
 * Names a schema so the document refers to it as a component and a generated client gets
 * a class of that name. arktype has no id of its own to carry, so the name lives here,
 * keyed by the schema object. Two different schemas under one name is an error.
 */
export const named = <T extends type.Any>(id: string, schema: T): T => {
	const existing = components.get(id);

	if (existing && existing !== schema) throw new Error(`Two schemas are named ${id}.`);

	components.set(id, schema);

	return schema;
};

export const namedComponents = (): ReadonlyMap<string, type.Any> => components;

/**
 * A timestamp. Services hand the response a Date and the check runs before serialisation,
 * so the schema is a Date. The document says ISO 8601 string, which is what the client
 * receives (see the `date` fallback in document.ts).
 */
export const timestamp = type("Date");
