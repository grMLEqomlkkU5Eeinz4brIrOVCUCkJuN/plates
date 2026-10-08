import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { API_PREFIX } from "./document";
import { describedRoutes } from "./index";
import { type ApiRoute, errorBodySchema } from "./registry";

export interface ResponseViolation {
	route: string;
	status: number;
	problem: string;
}

/** Filled by responseCheck, emptied and asserted on by the test setup after each test. */
export const responseViolations: ResponseViolation[] = [];

const routeKey = (method: string, path: string): string =>
	`${method.toUpperCase()} ${path.replace(/\/$/, "") || "/"}`;

// Importing ./index above has run every area file, so the list is complete.
const byKey = new Map<string, ApiRoute>(
	describedRoutes().map((route) => [routeKey(route.method, route.path), route])
);

/**
 * Checks every JSON body against the route's description before it is sent.
 * Installed by the test app only.
 */
export const responseCheck = (req: Request, res: Response, next: NextFunction): void => {
	const send = res.json.bind(res);

	res.json = (body: unknown): Response => {
		// req.route is the matched route; baseUrl is where its router is mounted.
		const pattern = req.route ? `${req.baseUrl}${req.route.path}`.slice(API_PREFIX.length) : undefined;
		const key = routeKey(req.method, pattern ?? req.path);
		const route = pattern === undefined ? undefined : byKey.get(key);
		const status = res.statusCode;
		const declared = route?.responses[status];

		const fail = (problem: string): void => {
			responseViolations.push({ route: key, status, problem });
		};
		const check = (schema: z.ZodType): void => {
			const result = schema.safeParse(body);
			if (!result.success) fail(z.prettifyError(result.error));
		};

		if (status >= 400) {
			check(typeof declared === "object" && declared.schema ? declared.schema : errorBodySchema);
		} else if (!route) {
			fail("The route is not described.");
		} else if (declared === undefined) {
			fail("The description does not list this status.");
		} else if (typeof declared === "string" || !declared.schema) {
			fail("The description says this status has no body.");
		} else {
			check(declared.schema);
		}

		return send(body);
	};

	next();
};
