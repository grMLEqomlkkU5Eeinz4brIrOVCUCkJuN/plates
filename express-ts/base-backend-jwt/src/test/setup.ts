import { afterEach, beforeAll } from "@jest/globals";
import { violations } from "../openapi/responseCheck";

beforeAll((): void => {
	process.env.NODE_ENV = "test";
});

afterEach((): void => {
	const found = violations.splice(0);
	if (found.length === 0) return;

	throw new Error(
		`Responses disagree with their description:\n${found
			.map((v) => `  ${v.route} ${v.status}: ${v.problem}`)
			.join("\n")}`
	);
});
