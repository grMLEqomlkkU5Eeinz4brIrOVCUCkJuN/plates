import { afterAll, beforeAll } from "@jest/globals";

// Global test setup
beforeAll((): void => {
	process.env.NODE_ENV = "test";
});

// Clean up after all tests
afterAll((): void => {
	// Add any global cleanup here
});
