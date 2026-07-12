import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { Database } from "../db";
import type { Logger } from "../lib/logger";

export interface Context {
	db: Database;
	req: Request;
	resHeaders: Headers;
	/** Shared with the access log and returned to the client on an error. */
	requestId: string;
	/** Already bound to the requestId - use this, not the root logger. */
	log: Logger;
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
