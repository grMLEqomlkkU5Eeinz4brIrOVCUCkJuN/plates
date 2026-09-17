import { describe, expect, it } from "@jest/globals";
import { hashPassword, verifyPassword } from "../password.service";

describe("password hashing", () => {
	it("round-trips, and two hashes of one password differ", async () => {
		const first = await hashPassword("correct horse battery staple");
		const second = await hashPassword("correct horse battery staple");

		expect(first).not.toBe(second);
		expect(first.startsWith("$argon2id$")).toBe(true);
		expect(await verifyPassword(first, "correct horse battery staple")).toBe(true);
		expect(await verifyPassword(first, "correct horse battery stapl")).toBe(false);
	});

	it("answers false, not a throw, for a stored value that is not a hash", async () => {
		// A corrupt row must be a 401 like a wrong password, never a 500.
		expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
		expect(await verifyPassword("", "anything")).toBe(false);
	});
});
