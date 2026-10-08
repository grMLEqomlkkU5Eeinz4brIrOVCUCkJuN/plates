import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

// Must run before any schema calls .openapi(). It patches zod's prototype,
// so it reaches schemas built earlier too.
extendZodWithOpenApi(z);

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/**
 * The template has no auth layer, so every route is open. Add "bearer" (and
 * the security scheme in document.ts) together with the first protected route.
 */
export type Access = "open";

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
 * Names a response schema so the document refers to it as a component. It
 * returns a tagged copy, so request schemas are named with `.meta({ id })`
 * where the model defines them instead: the validator must run the very
 * object the document describes. Two different schemas under one id is an
 * error.
 */
export const named = <T extends z.ZodType>(id: string, schema: T): T => {
	const existing = components.get(id);
	if (existing && existing !== schema) throw new Error(`Two schemas are named ${id}.`);
	components.set(id, schema);
	return schema.meta({ id }) as T;
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
