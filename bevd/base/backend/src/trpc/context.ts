import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { Database } from "../db";
import type { Logger } from "../lib/logger";
import type { ServiceCtx } from "../services/context";

/**
 * The tRPC context extends ServiceCtx rather than redeclaring its fields, so a resolver
 * can hand `ctx` straight to a service: `listPosts(ctx, input)`. The service's parameter
 * type is ServiceCtx, so everything added below - the raw Request, the response headers -
 * is invisible to it. The transport can see the transport; the service cannot.
 */
export interface Context extends ServiceCtx {
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

/**
 * The database and the logger are injected rather than imported, so tests can build a
 * caller against PGlite with no server, no network and no log noise.
 */
export function createContextFactory({ db, requestId, log }: ContextDeps) {
	return ({ req, resHeaders }: FetchCreateContextFnOptions): Context => ({
		db,
		req,
		resHeaders,
		requestId,
		log,
	});
}
