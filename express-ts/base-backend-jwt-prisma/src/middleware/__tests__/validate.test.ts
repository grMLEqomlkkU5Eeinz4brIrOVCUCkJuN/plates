import { describe, expect, it } from "@jest/globals";
import type { Request, Response } from "express";
import { listUsersQuery } from "../../models/user.model";
import { validate } from "../validate";

// Express 5 defines req.query as a getter that parses the URL on every read,
// so assigning into what it returns is lost on the next read.
const requestWithQuery = (query: Record<string, string>): Request => {
	const req = {} as Request;
	Object.defineProperty(req, "query", { get: () => ({ ...query }), configurable: true });
	return req;
};

describe("validate", () => {
	it("replaces the re-parsing req.query, so coercions reach the handler", () => {
		const req = requestWithQuery({ limit: "5" });
		let error: unknown;

		validate({ query: listUsersQuery })(req, {} as Response, (err?: unknown) => {
			error = err;
		});

		expect(error).toBeUndefined();
		expect(req.query).toEqual({ limit: 5 });
	});

	it("applies the default page size when the caller names none", () => {
		const req = requestWithQuery({});

		validate({ query: listUsersQuery })(req, {} as Response, () => undefined);

		expect(req.query).toEqual({ limit: 20 });
	});
});
