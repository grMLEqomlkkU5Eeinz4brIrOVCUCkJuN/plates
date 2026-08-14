import type { Database } from "../db";
import { logger } from "../lib/logger";
import type { ServiceCtx } from "../services/context";
import { appRouter } from "../trpc/routers";
import { createCallerFactory } from "../trpc/trpc";

const createCaller = createCallerFactory(appRouter);

/**
 * A tRPC caller with no server and no network.
 *
 * LOG_LEVEL is `silent` in vitest.config.ts, so the real logger is passed through rather
 * than stubbed: the logging middleware still runs (and would still fail on a bad call),
 * it just does not print.
 */
export function callerFor(db: Database) {
	return createCaller({
		db,
		req: new Request("http://localhost/trpc"),
		resHeaders: new Headers(),
		requestId: "test-request-id",
		log: logger,
	});
}

/**
 * A bare ServiceCtx, for testing a service without a transport in the way.
 *
 * This is what the uniform `(ctx, input)` signature buys: the same fields every service
 * takes, built in one line, with no router, no caller factory and no Request.
 */
export function serviceCtx(db: Database): ServiceCtx {
	return { db, log: logger };
}
