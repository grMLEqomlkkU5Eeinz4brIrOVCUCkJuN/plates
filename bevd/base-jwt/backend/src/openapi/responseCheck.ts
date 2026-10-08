import { type } from "arktype";
import { Elysia } from "elysia";
import { ErrorBody } from "../rest/error-body";
import { describedRoutes } from "./index";

/**
 * Routes that are deliberately not in the document, by the pattern Elysia registers them
 * under. The coverage test reads this too, so a new route has to land either here or in
 * the registry.
 */
export const UNDESCRIBED_ROUTES: ReadonlySet<string> = new Set([
	// tRPC's own wire format, typed end to end by AppRouter rather than by a document.
	// `.mount` registers both.
	"ALL /trpc",
	"ALL /trpc/*",
	// CORS preflight, answered by @elysiajs/cors.
	"OPTIONS /",
	"OPTIONS /*",
	// The documentation itself.
	"GET /docs",
	"GET /docs.json",
]);

/** What the response check found. src/test/setup.ts fails any test that leaves one behind. */
export const violations: string[] = [];

const failure = (schema: type.Any, body: unknown): string | undefined => {
	const result = schema(body);

	return result instanceof type.errors ? result.summary : undefined;
};

/**
 * Holds every response the app sends during a test to the route's description.
 *
 * Installed by the test app only (src/test/app.ts). It runs in mapResponse, which sees the
 * value before Elysia serialises it, so Dates are still Dates, and which runs for error
 * responses too, unlike afterHandle. Violations collect rather than throw: a throw here
 * would turn the response into a 500, and the test would fail on the status, far from
 * the cause.
 */
export const responseCheck = new Elysia({ name: "response-check" }).mapResponse(
	{ as: "global" },
	({ request, route, set, responseValue }) => {
		const key = `${request.method} ${route}`;

		if (!route || UNDESCRIBED_ROUTES.has(key) || UNDESCRIBED_ROUTES.has(`ALL ${route}`)) return;

		const status = typeof set.status === "number" ? set.status : 200;

		// On an error Elysia maps twice: once with no value yet (and its own status, 422
		// for a failed validation), then again with what onError returned. Only the second
		// is what the client gets. Every REST error has a body, so nothing real is skipped.
		if (status >= 400 && responseValue === undefined) return;

		const described = describedRoutes().find(
			(candidate) => `${candidate.method.toUpperCase()} ${candidate.path}` === key,
		);

		if (!described) {
			violations.push(`${key} answered ${status} but is not described.`);
			return;
		}

		const response = described.responses[status];

		if (status >= 400) {
			const schema =
				typeof response === "object" && response.schema ? response.schema : ErrorBody;
			const problem = failure(schema, responseValue);

			if (problem) violations.push(`${key} ${status}: ${problem}`);
			return;
		}

		if (response === undefined) {
			violations.push(`${key} answered ${status}, which its description does not list.`);
			return;
		}

		if (typeof response === "string" || !response.schema) {
			if (responseValue !== undefined && responseValue !== null && responseValue !== "") {
				violations.push(`${key} ${status} sent a body, but its description has none.`);
			}
			return;
		}

		const problem = failure(response.schema, responseValue);

		if (problem) violations.push(`${key} ${status}: ${problem}`);
	},
);
