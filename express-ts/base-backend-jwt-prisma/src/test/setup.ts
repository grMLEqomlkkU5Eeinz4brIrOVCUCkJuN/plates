import { afterAll, beforeEach } from "@jest/globals";
import { resetRateLimits, stopRateLimitSweep } from "../middleware/rateLimit";
import { disconnectDatabase } from "../db/prisma";

// Both imports pull in config/env.ts, which parses process.env once. That is
// fine for the one suite that re-reads the environment per case (the cookie
// suite): it requires its modules inside jest.isolateModules, which
// re-evaluates config/env.ts in a registry of its own.

// The limiter counts per process, and a test process runs a whole suite. One
// test spending the next one's budget is a failure nobody can read.
beforeEach(() => {
	resetRateLimits();
});

// The pool keeps the event loop alive; without this jest reports an open
// handle after every suite that touched the database.
afterAll(async () => {
	stopRateLimitSweep();
	await disconnectDatabase();
});
