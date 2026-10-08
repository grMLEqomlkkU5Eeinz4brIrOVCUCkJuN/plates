import { Elysia } from "elysia";
import { requestIdFrom } from "../lib/logger";

/**
 * A request id per call and the time it started, for every Elysia route.
 *
 * Named, so Elysia registers it once however many instances `.use` it: the app uses it for
 * the access log, and the REST routes use it again purely to get `requestId` into their
 * types. Without the name the derive would run twice, and a call with no inbound
 * x-request-id would log under one random id and answer with another.
 *
 * It can be named because it takes no per-instance deps. The plugins below that do (a
 * logger, a database) are left unnamed, or Elysia would hand every app the first one.
 */
export const requestContext = new Elysia({ name: "request-context" }).derive(
	{ as: "global" },
	({ request }) => ({
		requestId: requestIdFrom(request.headers.get("x-request-id")),
		startedAt: performance.now(),
	}),
);
