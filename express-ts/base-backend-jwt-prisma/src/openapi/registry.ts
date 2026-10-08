import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { errorBodySchema } from "../models/error.model";

// Must run before any schema calls .openapi(). It patches zod's prototype,
// so it reaches schemas built earlier too.
extendZodWithOpenApi(z);

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/**
 * session: needs the access cookie (`authenticate` runs).
 * public:  no session; the auth endpoints that open or renew one.
 * open:    no session and no client state at all (health probes).
 */
export type Access = "session" | "public" | "open";

export interface ApiResponse {
	description: string;
	/** JSON body. Omit for 204, and for error statuses (they use the shared error body). */
	schema?: z.ZodType;
}

export interface ApiRoute {
	method: HttpMethod;
	/** Path relative to /api/v1, Express-style: `/users/:id`. */
	path: string;
	/** Becomes the generated client's method name. Must be unique across the document. */
	operationId: string;
	summary: string;
	description?: string;
	tags: readonly string[];
	access: Access;
	/** `doubleCsrfProtection` runs: the x-csrf-token header is required. */
	csrf?: boolean;
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
 * client gets a class of that name. The named copy validates exactly as the
 * original does. zod's global registry refuses a second schema under one id.
 */
export const named = <T extends z.ZodType>(id: string, schema: T): T => {
	const tagged = schema.meta({ id }) as T;
	components.set(id, tagged);
	return tagged;
};

export const namedComponents = (): ReadonlyMap<string, z.ZodType> => components;

/** Every error status uses this unless its route declares a schema. Named
 *  here, not in document.ts, so it is the first component whichever module
 *  is imported first, and the generated file does not depend on that. */
export const errorBody = named("Error", errorBodySchema);
