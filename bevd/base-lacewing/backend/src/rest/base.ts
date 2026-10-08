import { Elysia, ValidationError } from "elysia";
import type { AppDeps } from "../app";
import { resolveRequestAuth } from "../http/auth";
import { csrfTokensMatch } from "../http/csrf";
import { requestContext } from "../http/request";
import { AppError, type ErrorCode } from "../lib/errors";
import type { ServiceCtx } from "../services/context";

export const REST_PREFIX = "/api/v1";

export const HTTP_STATUS: Record<ErrorCode, number> = {
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	CONFLICT: 409,
	INTERNAL: 500,
};

/**
 * REST twins of a few tRPC procedures, for callers that will not speak tRPC: curl, another
 * service, a generated OpenAPI client. Each route calls the same service function its
 * procedure calls, validated by the same arktype object, behind the same lacewing auth
 * (http/auth.ts) and the same CSRF rule. Nothing here decides anything a service decides.
 *
 * The rest of the tRPC surface is RPC-only on purpose. A twin is a second public contract
 * to keep stable, so one exists only where a non-tRPC caller needs it.
 */
export function restBase({ db, log: root }: AppDeps) {
	return (
		new Elysia({ prefix: REST_PREFIX })
			.use(requestContext)
			.derive(async ({ request, requestId, set }) => {
				const auth = await resolveRequestAuth(request);
				const log = root.child({ requestId, transport: "rest" });

				// Set here rather than after the handler, so error responses carry it too.
				set.headers["x-request-id"] = requestId;

				const service: ServiceCtx = {
					db,
					actor: auth.actor,
					// The user id, never the email - same reasoning as trpc/context.ts.
					log: auth.actor
						? log.child({ userId: auth.actor.id, role: auth.actor.role })
						: log,
				};

				return { auth, service };
			})

			// The csrfGuard of trpc/trpc.ts, for REST: a mutation authenticated by a cookie
			// must echo the csrf_token cookie in x-csrf-token. Bearer callers and anonymous
			// ones are exempt for the same reasons given there. It runs as a transform, before
			// the body is validated, so a forged request learns nothing about the body
			// schema - which is also the order tRPC applies its middleware in.
			.onTransform(({ request, auth, service }) => {
				if (
					request.method !== "GET" &&
					auth.actorSource === "cookie" &&
					!csrfTokensMatch(auth.csrf.cookie, auth.csrf.header)
				) {
					service.log.warn(
						{ event: "csrf.denied" },
						"mutation refused: bad or missing CSRF token",
					);

					throw new AppError("FORBIDDEN", "CSRF token missing or invalid");
				}
			})

			// One error body for every failure: `{ error: { code, message, requestId } }`, the
			// codes being lib/errors.ts's ErrorCode. Internal errors are flattened to a fixed
			// message and logged in full against the requestId, as trpc/trpc.ts does.
			.onError(({ code, error, set, requestId, path }) => {
				const log = root.child({ requestId, transport: "rest" });
				let status: number;
				let errorCode: ErrorCode;
				let message: string;

				if (error instanceof AppError) {
					status = HTTP_STATUS[error.code];
					errorCode = error.code;
					message = error.message;
				} else if (error instanceof ValidationError) {
					// The arktype messages, joined the way parseInput's summary joins them, so a
					// 400 reads the same whether Elysia or the service caught it.
					status = 400;
					errorCode = "BAD_REQUEST";
					message = error.all.map((issue) => issue.message).join("\n");
				} else if (code === "PARSE") {
					status = 400;
					errorCode = "BAD_REQUEST";
					message = "Malformed request body";
				} else {
					status = 500;
					errorCode = "INTERNAL";
					message = "Internal server error";
				}

				if (status >= 500) {
					log.error({ path, err: error }, "rest failed");
				} else {
					log.info({ path, code: errorCode }, "rest rejected");
				}

				set.status = status;
				set.headers["x-request-id"] = requestId;

				return { error: { code: errorCode, message, requestId } };
			})
	);
}

export type RestBase = ReturnType<typeof restBase>;

/**
 * For routes that need a signed-in caller: rejects an anonymous one before the body is
 * validated, as protectedProcedure does. The service checks again (requireActor); this is
 * only the early, transport-side answer.
 */
export function requireSignedIn({ auth }: { auth: { actor: unknown } }): void {
	if (!auth.actor) {
		throw new AppError("UNAUTHORIZED", "You must be signed in");
	}
}
