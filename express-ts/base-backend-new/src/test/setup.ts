// Global test setup
beforeAll(() => {
	// Set test environment
	process.env.NODE_ENV = "test";
	process.env.LOG_LEVEL = "error"; // Reduce noise during tests
});

// Clean up after all tests
afterAll(() => {
	// Add any global cleanup here
});
