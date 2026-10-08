import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { API_PREFIX, errorBodySchema } from "./document";
import { describedRoutes } from "./index";
import type { ApiRoute } from "./registry";

/** Filled while a test runs; test/setup.ts fails the test that leaves any behind. */
export const responseViolations: string[] = [];

let byKey: Map<string, ApiRoute> | undefined;

const describedRoute = (method: string, pattern: string): ApiRoute | undefined => {
	byKey ??= new Map(
		describedRoutes().map((route) => [
			`${route.method.toUpperCase()} ${route.path}`,
			route,
		])
	);
	return byKey.get(`${method} ${pattern}`);
};

/** The matched Express route under the API prefix, without the prefix: `/users/:id`. */
const matchedPattern = (req: Request): string | undefined => {
	const routePath: unknown = req.route?.path;
	if (typeof routePath !== "string" || !req.baseUrl.startsWith(API_PREFIX)) {
		return undefined;
	}
	const base = req.baseUrl.slice(API_PREFIX.length);
	return routePath === "/" ? base : base + routePath;
};

const check = (req: Request, status: number, body: unknown): void => {
	const pattern = matchedPattern(req);
	const route = pattern ? describedRoute(req.method, pattern) : undefined;
	const declared = route?.responses[status];
	const where = `${req.method} ${pattern ?? req.originalUrl} ${status}`;

	let schema: z.ZodType;
	if (status >= 400) {
		schema =
			typeof declared === "object" && declared.schema
				? declared.schema
				: errorBodySchema;
	} else if (!route) {
		responseViolations.push(`${where}: the route is not described`);
		return;
	} else if (!declared) {
		responseViolations.push(`${where}: the status is not described`);
		return;
	} else if (typeof declared === "string" || !declared.schema) {
		responseViolations.push(`${where}: sent a body, the description has none`);
		return;
	} else {
		schema = declared.schema;
	}

	const result = schema.safeParse(body);
	if (!result.success) {
		responseViolations.push(`${where}: ${z.prettifyError(result.error)}`);
	}
};

/** Installed by the test app only. Checks every JSON body against its description. */
export const responseCheck = (
	req: Request,
	res: Response,
	next: NextFunction
): void => {
	const send = res.json.bind(res);
	res.json = (body: unknown): Response => {
		check(req, res.statusCode, body);
		return send(body);
	};
	next();
};
