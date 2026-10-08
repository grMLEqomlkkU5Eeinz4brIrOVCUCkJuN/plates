import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";
import { type ApiRoute, describedRoutes, errorBody } from "./registry";
import "./index";

const API_PREFIX = "/api/v1";

export interface Violation {
	route: string;
	status: number;
	problem: string;
}

/** Filled by the check below; test/setup.ts fails any test that leaves one. */
export const violations: Violation[] = [];

export const routeKey = (method: string, path: string): string =>
	`${method.toUpperCase()} ${path}`;

/** `/api/v1/health` + `/` is `/health`: the router mounts at the area, the
 *  description names the full path under the prefix. */
export const describedPath = (baseUrl: string, routePath: string): string => {
	const full = `${baseUrl}${routePath}`.slice(API_PREFIX.length);
	return full.length > 1 ? full.replace(/\/$/, "") : full;
};

let byKey: Map<string, ApiRoute> | undefined;

const lookup = (key: string): ApiRoute | undefined => {
	byKey ??= new Map(describedRoutes().map((route) => [routeKey(route.method, route.path), route]));
	return byKey.get(key);
};

const issuesOf = (error: z.ZodError): string =>
	error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");

/**
 * Wraps res.json so every body a test provokes is parsed against the
 * description before it is sent. Installed by the test app only: in
 * production the check would cost a parse per response and could only log.
 */
export const responseCheck = (req: Request, res: Response, next: NextFunction): void => {
	const send = res.json.bind(res);

	res.json = (body: unknown): Response => {
		const status = res.statusCode;
		// req.route is the matched route while a handler runs. An error raised
		// in router-level middleware (authenticate) reaches the error handler
		// with no route, and is checked against the shared error body only.
		const key = req.route
			? routeKey(req.method, describedPath(req.baseUrl, req.route.path as string))
			: routeKey(req.method, req.originalUrl.split("?")[0] ?? "");
		const route = req.route ? lookup(key) : undefined;
		const declared = route?.responses[status];
		const record = (problem: string): void => {
			violations.push({ route: key, status, problem });
		};

		if (status >= 400) {
			const schema = typeof declared === "object" && declared.schema ? declared.schema : errorBody;
			const parsed = schema.safeParse(body);
			if (!parsed.success) record(issuesOf(parsed.error));
		} else if (!route) {
			record("route is not described");
		} else if (!declared) {
			record("status is not described");
		} else if (typeof declared === "string" || !declared.schema) {
			record("body sent where the description says none");
		} else {
			const parsed = declared.schema.safeParse(body);
			if (!parsed.success) record(issuesOf(parsed.error));
		}

		return send(body);
	};

	next();
};
