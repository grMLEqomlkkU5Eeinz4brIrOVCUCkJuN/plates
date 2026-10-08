import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { API_PREFIX, describedRoutes } from "./index";
import { type ApiRoute, errorBodySchema } from "./registry";

export interface Violation {
	route: string;
	status: number;
	problem: string;
}

/** Filled by responseCheck; test/setup.ts fails any test that leaves one behind. */
export const violations: Violation[] = [];

const patterns = describedRoutes().map((route) => ({
	route,
	regex: new RegExp(`^${route.path.replace(/:\w+/g, "[^/]+")}/?$`),
}));

/**
 * Matched on the URL rather than req.route: by the time errorHandler answers,
 * Express has restored req.baseUrl, so baseUrl + route.path no longer names the
 * route that failed.
 */
const findRoute = (req: Request): ApiRoute | undefined => {
	const path = req.originalUrl.split("?")[0]!;
	if (!path.startsWith(API_PREFIX)) return undefined;
	const rest = path.slice(API_PREFIX.length);
	const method = req.method.toLowerCase();
	return patterns.find(
		({ route, regex }) => route.method === method && regex.test(rest)
	)?.route;
};

const problemsOf = (schema: z.ZodType, body: unknown): string | undefined => {
	const result = schema.safeParse(body);
	return result.success ? undefined : z.prettifyError(result.error);
};

/** Test app only: checks every JSON body against the route's description. */
export const responseCheck = (
	req: Request,
	res: Response,
	next: NextFunction
): void => {
	const json = res.json.bind(res);

	res.json = (body: unknown): Response => {
		const status = res.statusCode;
		const route = findRoute(req);
		const key = route
			? `${route.method.toUpperCase()} ${route.path}`
			: `${req.method} ${req.originalUrl}`;
		const record = (problem: string): void => {
			violations.push({ route: key, status, problem });
		};

		const declared = route?.responses[status];

		if (status >= 400) {
			const schema =
				typeof declared === "object" && declared.schema
					? declared.schema
					: errorBodySchema;
			const problem = problemsOf(schema, body);
			if (problem) record(problem);
		} else if (!route) {
			record("route is not described");
		} else if (declared === undefined) {
			record("status is not described");
		} else if (typeof declared === "string" || !declared.schema) {
			record("description says no body");
		} else {
			const problem = problemsOf(declared.schema, body);
			if (problem) record(problem);
		}

		return json(body);
	};

	next();
};
