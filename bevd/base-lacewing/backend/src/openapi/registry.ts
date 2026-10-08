import type { Type } from "arktype";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/**
 * How lacewing lets a caller in, as http/auth.ts resolves it. The document builder turns
 * each level into security requirements (see securityFor in document.ts).
 *
 * open:          reads no credentials at all (the health probe).
 * anyone:        anonymous is welcome; a valid access token - the access_token cookie or
 *                a bearer header - changes what the caller gets, never whether they get in.
 * signedIn:      an access token is required; without one the answer is 401.
 * refreshCookie: the refresh_token cookie is the credential (auth refresh).
 *
 * CSRF is not a level of its own: any non-GET request whose access token arrives in the
 * cookie must also carry the x-csrf-token pair, whatever its level. The builder adds it
 * to every cookie alternative of every non-GET route.
 */
export type Access = "open" | "anyone" | "signedIn" | "refreshCookie";

export interface ApiResponse {
	description: string;
	/** JSON body as the client receives it. Omit for error statuses; they use ErrorBody. */
	schema?: Type;
	/** The response replaces the session cookies (Set-Cookie). */
	setsCookies?: boolean;
}

export interface ApiRoute {
	method: HttpMethod;
	/** The full path, Elysia-style: `/api/v1/posts/:id`. */
	path: string;
	/** Becomes the generated client's method name. Must be unique across the document. */
	operationId: string;
	summary: string;
	description?: string;
	tags: readonly string[];
	access: Access;
	/** The tRPC procedure this route is a twin of, as `router.procedure`. */
	procedure?: string;
	/** The arktype objects the route validates with - the same objects, not copies. */
	request?: {
		params?: Type;
		query?: Type;
		body?: Type;
	};
	/** By status code. A string describes an error status. */
	responses: Record<number, ApiResponse | string>;
}

const routes: ApiRoute[] = [];
const components = new Map<string, Type>();

/** Called once per area file, at import time. */
export const describeRoutes = (list: readonly ApiRoute[]): void => {
	routes.push(...list);
};

export const describedRoutes = (): readonly ApiRoute[] => routes;

/**
 * Names a schema so the document lists it under components and refers to it by $ref
 * wherever it appears, and a generated client gets a class of that name. Two different
 * schemas under one id is an error.
 */
export const named = <T extends Type>(id: string, schema: T): T => {
	const existing = components.get(id);

	if (existing && existing !== schema) throw new Error(`Two schemas are named ${id}.`);

	components.set(id, schema);

	return schema;
};

export const namedComponents = (): ReadonlyMap<string, Type> => components;
