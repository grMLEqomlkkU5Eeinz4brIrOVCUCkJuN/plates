import { describe, expect, it } from "@jest/globals";
import { loginSchema, registerSchema } from "../auth.model";
import { listUsersQuery, toAccount, toPublicUser, updateAccountSchema } from "../user.model";

/**
 * The boundary: what a client is allowed to send, and what a row is allowed
 * to become on the way out. Ids and timestamps come from Postgres, so there
 * is no factory to test; these are the rules that stand between a request
 * body and a write, and between a row and a response.
 */
describe("registerSchema", () => {
	it("normalises the address and keeps nothing it was not told about", () => {
		const result = registerSchema.safeParse({
			email: "  Someone@Example.COM ",
			name: " Someone ",
			password: "a-long-enough-password",
		});

		expect(result.success).toBe(true);
		expect(result.data).toEqual({
			email: "someone@example.com",
			name: "Someone",
			password: "a-long-enough-password",
		});
	});

	it("refuses a field the endpoint does not own", () => {
		const result = registerSchema.safeParse({
			email: "someone@example.com",
			name: "Someone",
			password: "a-long-enough-password",
			id: "00000000-0000-0000-0000-000000000000",
		});

		expect(result.success).toBe(false);
	});

	it("bounds the password at both ends", () => {
		expect(registerSchema.safeParse({ email: "a@b.co", name: "A", password: "123456789" }).success).toBe(false);
		expect(registerSchema.safeParse({ email: "a@b.co", name: "A", password: "x".repeat(129) }).success).toBe(false);
		expect(registerSchema.safeParse({ email: "a@b.co", name: "A", password: "x".repeat(128) }).success).toBe(true);
	});
});

describe("loginSchema", () => {
	it("accepts a password shorter than registration allows", () => {
		// The floor could have been different when the account was made.
		expect(loginSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(true);
	});
});

describe("updateAccountSchema", () => {
	it("needs at least one field", () => {
		expect(updateAccountSchema.safeParse({}).success).toBe(false);
		expect(updateAccountSchema.safeParse({ name: "New" }).success).toBe(true);
	});

	it("still validates the address", () => {
		expect(updateAccountSchema.safeParse({ email: "nope" }).success).toBe(false);
	});
});

describe("listUsersQuery", () => {
	it("defaults the page size and caps it", () => {
		expect(listUsersQuery.parse({})).toEqual({ limit: 20 });
		expect(listUsersQuery.parse({ limit: "100" })).toEqual({ limit: 100 });
		expect(listUsersQuery.safeParse({ limit: "101" }).success).toBe(false);
		expect(listUsersQuery.safeParse({ limit: "0" }).success).toBe(false);
	});

	it("refuses a cursor that is not an id", () => {
		expect(listUsersQuery.safeParse({ cursor: "last-page" }).success).toBe(false);
	});
});

describe("the projections", () => {
	const row = {
		id: "00000000-0000-0000-0000-000000000000",
		email: "someone@example.com",
		name: "Someone",
		passwordHash: "$argon2id$v=19$m=1024,t=1,p=1$c2FsdA$aGFzaA",
		createdAt: new Date("2026-01-01T00:00:00Z"),
		updatedAt: new Date("2026-01-02T00:00:00Z"),
	};

	it("never carry the password hash", () => {
		expect(toAccount(row)).toEqual({
			id: row.id,
			email: row.email,
			name: row.name,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		});
		expect(toPublicUser(row)).toEqual({ id: row.id, name: row.name, createdAt: row.createdAt });
	});
});
