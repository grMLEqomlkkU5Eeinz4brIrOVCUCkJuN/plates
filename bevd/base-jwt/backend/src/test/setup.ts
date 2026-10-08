import { afterEach } from "vitest";
import { violations } from "../openapi/responseCheck";

// A response that disagrees with openapi.json fails the test that provoked it, naming the
// route and the field, rather than surfacing later as a broken generated client.
afterEach(() => {
	const found = violations.splice(0);

	if (found.length > 0) {
		throw new Error(`Responses disagree with the OpenAPI description:\n${found.join("\n")}`);
	}
});
