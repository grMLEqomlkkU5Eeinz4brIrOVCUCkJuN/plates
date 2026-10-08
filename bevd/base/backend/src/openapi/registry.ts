import type { Type } from "arktype";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

export interface ApiResponse {
	description: string;
	/** JSON body. Omit for 204, and for error statuses (they use the shared error body). */
	schema?: Type;
}

/**
 * One REST route, described once. The request schemas are the arktype objects the route
 * validates with, not copies: the identity test in __tests__/openapi.test.ts holds them to
 * that. There is no `access` field because this template has no authentication; every
 * route is open, and the document declares no security scheme.
 */
export interface ApiRoute {
	method: HttpMethod;
	/** The full path as Elysia registers it: `/api/v1/posts/:id`. */
	path: string;
	/** Becomes a generated client's method name. Must be unique across the document. */
	operationId: string;
	summary: string;
	description?: string;
	tags: readonly string[];
	request?: {
		params?: Type;
		query?: Type;
		body?: Type;
	};
	/** By status code. A string describes an error status, which answers with ErrorBody. */
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
 * Names a schema, so the document lists it once under components and refers to it by
 * `$ref` wherever its JSON Schema turns up, including nested inside another schema (a
 * list of posts refers to Post). Two different schemas under one id is an error.
 */
export const named = <T extends Type>(id: string, schema: T): T => {
	const existing = components.get(id);
	if (existing && existing !== schema) throw new Error(`Two schemas are named ${id}.`);
	components.set(id, schema);
	return schema;
};

export const namedComponents = (): ReadonlyMap<string, Type> => components;
