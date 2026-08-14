import type { Actor } from "../auth/policy";
import type { Database } from "../db";
import { logger } from "../lib/logger";
import type { ServiceCtx } from "../services/context";
import { appRouter } from "../trpc/routers";
import { createCallerFactory } from "../trpc/trpc";

const createCaller = createCallerFactory(appRouter);

interface CallerOptions {
	actor?: Actor | null;
	refreshToken?: string;
}

/**
 * A tRPC caller with no server and no network, plus the response headers it writes - which
 * is how the auth tests read back the cookies the router set.
 *
 * LOG_LEVEL is `silent` in vitest.config.ts, so the real logger is passed through rather
 * than stubbed: the logging middleware still runs (and would still fail on a bad call), it
 * just does not print.
 */
export function callerWithHeaders(
	db: Database,
	{ actor = null, refreshToken }: CallerOptions = {},
) {
	const resHeaders = new Headers();

	const trpc = createCaller({
		db,
		actor,
		resHeaders,
		refreshToken,
		req: new Request("http://localhost/trpc"),
		requestId: "test-request-id",
		log: logger,
	});

	return { trpc, resHeaders };
}

/** The common case: act as this user (or as nobody) and ignore the response headers. */
export function callerAs(db: Database, actor: Actor | null) {
	return callerWithHeaders(db, { actor }).trpc;
}

/**
 * A bare ServiceCtx, for testing a service without a transport in the way.
 *
 * This is what the uniform `(ctx, input)` signature buys: the same three fields every
 * service takes, built in one line, with no router, no caller factory and no Request.
 */
export function serviceCtx(db: Database, actor: Actor | null = null): ServiceCtx {
	return { db, log: logger, actor };
}
