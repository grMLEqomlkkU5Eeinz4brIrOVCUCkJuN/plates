import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

// Must run before any schema calls .openapi(). It patches zod's prototype,
// so it reaches schemas built earlier too.
extendZodWithOpenApi(z);

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/**
 * session: needs the access_token cookie (the `authenticate` middleware).
 * refresh: needs the refresh_token cookie, which the handler reads itself.
 * open:    needs neither.
 */
export type Access = "session" | "refresh" | "open";

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
	/** The route runs doubleCsrfProtection and needs the x-csrf-token header. */
	csrf?: boolean;
	/**
	 * The schemas the route's `validate` middleware runs, the same objects.
	 * A request schema that should be a component carries `.meta({ id })` where
	 * it is defined: `named` returns a copy, which would break that identity.
	 */
	request?: {
		params?: z.ZodObject;
		query?: z.ZodObject;
		body?: z.ZodType;
	};
	/** By status code. A string describes an error status. */
	responses: Record<number, ApiResponse | string>;
}

const routes: ApiRoute[] = [];
const components = new Map<string, { source: z.ZodType; tagged: z.ZodType }>();

/** Called once per area file, at import time. */
export const describeRoutes = (list: readonly ApiRoute[]): void => {
	routes.push(...list);
};

export const describedRoutes = (): readonly ApiRoute[] => routes;

/**
 * Names a schema so the document refers to it as a component and the generated
 * client gets a class of that name. Two different schemas under one id is an
 * error.
 */
export const named = <T extends z.ZodType>(id: string, schema: T): T => {
	const existing = components.get(id);
	if (existing) {
		if (existing.source !== schema) throw new Error(`Two schemas are named ${id}.`);
		return existing.tagged as T;
	}
	const tagged = schema.meta({ id }) as T;
	components.set(id, { source: schema, tagged });
	return tagged;
};

/** What errorHandler sends for every error status. */
export const errorBodySchema = named(
	"Error",
	z.strictObject({
		success: z.literal(false),
		message: z.string(),
		stack: z.string().optional().openapi({ description: "Only when NODE_ENV is development." }),
	})
);
