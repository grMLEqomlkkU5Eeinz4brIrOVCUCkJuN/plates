import { Elysia } from "elysia";
import { requestIdFrom } from "../lib/logger";

/**
 * The request id and start time every Elysia route is handed.
 *
 * A named plugin because two instances need it: the app, which logs the id and echoes it
 * back, and the REST plugin (rest/context.ts), which puts it in error bodies and needs it
 * typed. Elysia registers a named plugin once however many times it is `.use`d, so both
 * see the same id. Two plain derives would mint two ids for one request whenever the
 * caller sent none, and the error body would quote an id no log line carries.
 */
export const requestContext = new Elysia({ name: "request-context" }).derive(
	{ as: "scoped" },
	({ request }) => ({
		requestId: requestIdFrom(request.headers.get("x-request-id")),
		startedAt: performance.now(),
	}),
);
