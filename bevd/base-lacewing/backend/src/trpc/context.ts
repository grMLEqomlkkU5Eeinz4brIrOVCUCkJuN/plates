import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { Database } from "../db";
import { type RequestAuth, resolveRequestAuth } from "../http/auth";
import type { Logger } from "../lib/logger";
import type { ServiceCtx } from "../services/context";

/**
 * The tRPC context extends ServiceCtx rather than redeclaring its fields, so a resolver
 * can hand `ctx` straight to a service: `listPosts(ctx, input)`. The service's parameter
 * type is ServiceCtx, so everything added below - the raw Request, the response headers,
 * the CSRF pair - is invisible to it. The transport can see the transport; the service
 * cannot.
 *
 * The auth fields (actorSource, refreshToken, csrf) come from http/auth.ts, which the
 * REST routes read too.
 */
export interface Context extends ServiceCtx, Omit<RequestAuth, "actor"> {
	req: Request;
	resHeaders: Headers;
	/** Shared with the access log and returned to the client on an error. */
	requestId: string;
}

export interface ContextDeps {
	db: Database;
	requestId: string;
	log: Logger;
}

export function createContextFactory({ db, requestId, log }: ContextDeps) {
	return async ({ req, resHeaders }: FetchCreateContextFnOptions): Promise<Context> => {
		const auth = await resolveRequestAuth(req);

		return {
			db,
			req,
			resHeaders,
			...auth,
			requestId,
			// Every line this request produces now carries who made it. Note that it is the
			// user *id*, not the email: logs get shipped, indexed and kept, and there is no
			// reason to spread personal data through them.
			log: auth.actor ? log.child({ userId: auth.actor.id, role: auth.actor.role }) : log,
		};
	};
}
