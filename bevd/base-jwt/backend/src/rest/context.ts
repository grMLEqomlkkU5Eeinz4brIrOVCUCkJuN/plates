import { Elysia, ValidationError } from "elysia";
import { requireActor } from "../auth/actor";
import type { Database } from "../db";
import { resolveActor } from "../http/actor";
import { requestContext } from "../http/request";
import { AppError, type ErrorCode } from "../lib/errors";
import { type Logger, requestIdFrom } from "../lib/logger";
import type { ServiceCtx } from "../services/context";

export const REST_PREFIX = "/api/v1";

/** The same statuses tRPC's fetch adapter sends for the same codes. */
const HTTP_STATUS: Record<ErrorCode, number> = {
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	CONFLICT: 409,
	INTERNAL: 500,
};

/** Every REST failure has this body. Described once, as the `Error` schema, in openapi/schemas.ts. */
export interface ErrorBody {
	error: { code: ErrorCode; message: string; requestId: string };
}

/** One finished REST call, as the test app's response check sees it (openapi/responseCheck.ts). */
export interface RestExchange {
	method: string;
	/** The route pattern, `/api/v1/posts/:id`, not the concrete path. */
	route: string;
	status: number;
	/** The value before serialisation: Dates are still Dates. */
	body: unknown;
}

export interface RestDeps {
	db: Database;
	log: Logger;
	/** Test only. Production passes nothing. */
	inspect?: (exchange: RestExchange) => void;
}

/**
 * What a failure becomes on the wire, and in the log.
 *
 * The same rules tRPC's errorFormatter and observe middleware apply: an AppError is the
 * system working and is logged at info with its own message; anything else is a bug,
 * logged with its stack and reported as a bare internal error.
 *
 * A validation failure gets the text parseInput (lib/errors.ts) would have thrown, which
 * is what gRPC sends. tRPC words the same failure as a bulleted list, because it calls
 * arktype's `.assert()` rather than reading `.summary`; the facts are identical.
 */
function toErrorResponse(error: unknown, code: unknown, log: Logger) {
	if (error instanceof AppError && error.code !== "INTERNAL") {
		log.info({ code: error.code }, "rest rejected");

		return { status: HTTP_STATUS[error.code], code: error.code, message: error.message };
	}

	if (error instanceof ValidationError) {
		// One line per failing field, which is how arktype's `.summary` reads.
		const message = error.all.map((issue) => issue.message).join("\n");

		log.info({ code: "BAD_REQUEST" }, "rest rejected");

		return { status: 400, code: "BAD_REQUEST" as const, message };
	}

	if (code === "PARSE") {
		log.info({ code: "BAD_REQUEST" }, "rest rejected");

		return { status: 400, code: "BAD_REQUEST" as const, message: "Malformed request body" };
	}

	log.error({ err: error }, "rest failed");

	return { status: 500, code: "INTERNAL" as const, message: "Internal server error" };
}

/**
 * The base every REST route file builds on: the prefix, the caller, and the error mapping.
 *
 * Handlers get `ctx`, a ServiceCtx, and hand it straight to a service, the way a tRPC
 * resolver does. Nothing here decides who may do what beyond "is anyone signed in"; that
 * is the services' call, as it is for the other two transports.
 */
export function restContext({ db, log: root, inspect }: RestDeps) {
	return new Elysia({ prefix: REST_PREFIX })
		.use(requestContext)
		.derive(async ({ request, requestId }) => {
			const actor = await resolveActor(request);
			const log = root.child({ requestId, transport: "rest" });

			// The user id, never the email, for the reason given in trpc/context.ts.
			const ctx: ServiceCtx = {
				db,
				actor,
				log: actor ? log.child({ userId: actor.id, role: actor.role }) : log,
			};

			return { ctx };
		})
		.onAfterHandle(({ request, route, set, response }) => {
			inspect?.({
				method: request.method,
				route,
				status: typeof set.status === "number" ? set.status : 200,
				body: response,
			});
		})
		.onError(({ error, code, request, route, set, requestId, ctx }) => {
			// A body that fails to parse is rejected before derive runs, so neither the id
			// nor the per-request logger exists yet. Fall back to what they would have been.
			const id = requestId ?? requestIdFrom(request.headers.get("x-request-id"));
			const log = ctx?.log ?? root.child({ requestId: id, transport: "rest" });

			const failure = toErrorResponse(error, code, log);
			const body: ErrorBody = {
				error: { code: failure.code, message: failure.message, requestId: id },
			};

			set.status = failure.status;
			set.headers["x-request-id"] = id;
			inspect?.({ method: request.method, route, status: failure.status, body });

			return body;
		});
}

export type RestApp = ReturnType<typeof restContext>;

/**
 * Route-level `transform` for routes that need a session: protectedProcedure's check.
 *
 * `transform` runs before Elysia validates the body, so an anonymous caller hears "sign
 * in" before it hears what was wrong with its input, which is the order tRPC answers in.
 * Like protectedProcedure this is an early answer, not the boundary; the service checks
 * again.
 */
export function signedIn({ ctx }: { ctx: ServiceCtx }): void {
	requireActor(ctx.actor);
}
