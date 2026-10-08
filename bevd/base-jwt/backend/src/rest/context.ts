import { Elysia } from "elysia";
import type { AppDeps } from "../app";
import { requireActor } from "../auth/actor";
import { resolveActor } from "../http/actor";
import type { ServiceCtx } from "../services/context";
import { requestContext } from "./request";

/**
 * Hands every REST route a ServiceCtx, `ctx`, built from the caller's cookie or bearer
 * header exactly as trpc/context.ts builds the tRPC one. A handler passes it straight to a
 * service, the way a tRPC resolver does; who may do what is the service's call.
 *
 * A derive rather than a resolve so that it runs before validation: `signedIn` below needs
 * the actor in a route's `transform`. Unnamed, because it holds this app's database and
 * logger.
 */
export function restContext({ db, log: root }: AppDeps) {
	return new Elysia()
		.use(requestContext)
		.derive({ as: "scoped" }, async ({ request, requestId }) => {
			const actor = await resolveActor(request);
			const log = root.child({ requestId, transport: "rest" });

			// The user id, never the email, for the reason given in trpc/context.ts.
			const ctx: ServiceCtx = {
				db,
				actor,
				log: actor ? log.child({ userId: actor.id, role: actor.role }) : log,
			};

			return { ctx };
		});
}

/**
 * Route-level `transform` for routes that need a session: protectedProcedure's check.
 *
 * `transform` runs before Elysia validates the body, so an anonymous caller hears "sign
 * in" before it hears what was wrong with its input, which is the order tRPC answers in.
 * Like protectedProcedure it is an early answer, not the boundary; the service checks
 * again.
 */
export function signedIn({ ctx }: { ctx: ServiceCtx }): void {
	requireActor(ctx.actor);
}
