import { afterEach } from "vitest";
import { violations } from "../openapi/responseCheck";

// A response that disagrees with the OpenAPI description fails the test that received
// it, whatever that test was asserting.
afterEach(() => {
	const found = violations.splice(0);

	if (found.length > 0) {
		throw new Error(`Responses disagree with the OpenAPI description:\n${found.join("\n")}`);
	}
});
