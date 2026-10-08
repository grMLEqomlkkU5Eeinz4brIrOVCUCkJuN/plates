import { Elysia } from "elysia";
import { createApp } from "../app";
import type { Database } from "../db";
import { logger } from "../lib/logger";
import { responseCheck } from "../openapi/responseCheck";

/**
 * The real app, with every response held to its OpenAPI description. The check is global,
 * so it reaches the routes inside createApp; src/test/setup.ts fails the test on a
 * violation.
 */
export function testApp(db: Database) {
	return new Elysia().use(responseCheck).use(createApp({ db, log: logger }));
}
