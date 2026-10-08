import { afterAll, afterEach, beforeAll } from "@jest/globals";
import { responseViolations } from "../openapi/responseCheck";

// Global test setup
beforeAll((): void => {
	process.env.NODE_ENV = "test";
});

// A response that strays from its OpenAPI description fails the test that sent it.
afterEach((): void => {
	const violations = responseViolations.splice(0);
	if (violations.length > 0) {
		throw new Error(
			`Responses do not match openapi:\n${violations.join("\n")}`
		);
	}
});

// Clean up after all tests
afterAll((): void => {
	// Add any global cleanup here
});
