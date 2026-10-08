import { Elysia } from "elysia";
import { requestIdFrom } from "../lib/logger";

/**
 * A request id per call, and when it started.
 *
 * Named, so Elysia runs it once per request however many plugins `.use` it: the app uses
 * it for the access log, and rest/base.ts uses it so its error bodies quote the same id.
 * Two separate derives would each mint their own random id when the header is absent,
 * and the log line and the error body would point at different requests.
 */
export const requestContext = new Elysia({ name: "request-context" }).derive(
	{ as: "global" },
	({ request }) => ({
		requestId: requestIdFrom(request.headers.get("x-request-id")),
		startedAt: performance.now(),
	}),
);
