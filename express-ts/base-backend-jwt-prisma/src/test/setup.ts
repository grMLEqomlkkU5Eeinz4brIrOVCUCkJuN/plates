import { afterAll, afterEach, beforeEach, expect } from "@jest/globals";
import { resetRateLimits, stopRateLimitSweep } from "../middleware/rateLimit";
import { disconnectDatabase } from "../db/prisma";
import { violations } from "../openapi/responseCheck";

// Both imports pull in config/env.ts, which parses process.env once. That is
// fine for the one suite that re-reads the environment per case (the cookie
// suite): it requires its modules inside jest.isolateModules, which
// re-evaluates config/env.ts in a registry of its own.

// The limiter counts per process, and a test process runs a whole suite. One
// test spending the next one's budget is a failure nobody can read.
beforeEach(() => {
	resetRateLimits();
});

// A body the OpenAPI description does not match fails the test that sent it,
// naming the route, the status and the field.
afterEach(() => {
	const found = violations.splice(0);
	expect(found).toEqual([]);
});

// The pool keeps the event loop alive; without this jest reports an open
// handle after every suite that touched the database.
afterAll(async () => {
	stopRateLimitSweep();
	await disconnectDatabase();
});
