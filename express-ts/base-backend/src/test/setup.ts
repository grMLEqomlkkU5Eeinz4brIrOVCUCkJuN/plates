import { afterAll, afterEach, beforeAll, expect } from "@jest/globals";
import { responseViolations } from "../openapi/responseCheck";

// Global test setup
beforeAll((): void => {
	process.env.NODE_ENV = "test";
});

// A response that does not match its route's openapi description fails the
// test that produced it.
afterEach((): void => {
	expect(responseViolations.splice(0)).toEqual([]);
});

// Clean up after all tests
afterAll((): void => {
	// Add any global cleanup here
});
