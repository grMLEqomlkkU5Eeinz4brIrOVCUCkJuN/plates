import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

// Must run before any schema calls .openapi(). It patches zod's prototype,
// so it reaches schemas built earlier too.
extendZodWithOpenApi(z);

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/**
 * What lacewing lets in (middleware/auth.ts).
 * bearer:  the access token, as the access_token cookie or, when that cookie is
 *          absent, an Authorization: Bearer header.
 * refresh: the refresh_token cookie, which the browser only sends to the
 *          refresh path.
 * open:    neither.
 */
export type Access = "bearer" | "refresh" | "open";

export interface ApiResponse {
	description: string;
	/** JSON body. Omit for 204, and for error statuses (they use the shared error body). */
	schema?: z.ZodType;
}

export interface ApiRoute {
	method: HttpMethod;
	/** Path relative to the API prefix, Express-style: `/users/:id`. */
	path: string;
	/** Becomes the generated client's method name. Must be unique across the document. */
	operationId: string;
	summary: string;
	description?: string;
	tags: readonly string[];
	access: Access;
	/**
	 * doubleCsrfProtection runs: the x-csrf-token header must match the __csrf
	 * cookie, whichever way the access token arrived.
	 */
	csrf?: true;
	request?: {
		params?: z.ZodObject;
		query?: z.ZodObject;
		body?: z.ZodType;
	};
	/** By status code. A string describes an error status. */
	responses: Record<number, ApiResponse | string>;
}

const routes: ApiRoute[] = [];
const components = new Map<string, z.ZodType>();

/** Called once per area file, at import time. */
export const describeRoutes = (list: readonly ApiRoute[]): void => {
	routes.push(...list);
};

export const describedRoutes = (): readonly ApiRoute[] => routes;

/**
 * Names a schema so the document refers to it as a component and the generated
 * client gets a class of that name. Register a schema before using it nullable
 * anywhere: an unregistered component takes its first use's nullability with it.
 *
 * Two different schemas under one id is an error.
 *
 * This returns a .meta() copy, so a request schema cannot be named here: the
 * document would describe the copy while validate() runs the original. The
 * models name their request schemas with .meta({ id }) where they are built.
 */
export const named = <T extends z.ZodType>(id: string, schema: T): T => {
	const existing = components.get(id);
	if (existing && existing !== schema)
		throw new Error(`Two schemas are named ${id}.`);
	const tagged = schema.meta({ id }) as T;
	components.set(id, tagged);
	return tagged;
};
