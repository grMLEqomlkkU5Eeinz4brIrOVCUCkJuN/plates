import { describe, expect, it } from "@jest/globals";
import {
	createUserSchema,
	updateUserSchema,
	userSchema,
} from "../user.model";

/**
 * There is nothing to unit-test in the model itself any more: ids and
 * timestamps come from Postgres (`@default(uuid())`, `@default(now())`,
 * `@updatedAt`), not from a factory function. What is left is the boundary -
 * what a client is allowed to send - and that is worth testing, because it is
 * the only thing standing between a request body and a write.
 */
describe("createUserSchema", () => {
	it("should validate correct input", () => {
		const result = createUserSchema.safeParse({
			email: "test@example.com",
			name: "Test User",
		});

		expect(result.success).toBe(true);
	});

	it("should reject invalid email", () => {
		const result = createUserSchema.safeParse({
			email: "invalid-email",
			name: "Test User",
		});

		expect(result.success).toBe(false);
	});

	it("should reject empty name", () => {
		const result = createUserSchema.safeParse({
			email: "test@example.com",
			name: "",
		});

		expect(result.success).toBe(false);
	});

	it("should drop database-owned fields", () => {
		const result = createUserSchema.safeParse({
			id: "00000000-0000-0000-0000-000000000000",
			email: "test@example.com",
			name: "Test User",
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		expect(result.success).toBe(true);
		// validate() replaces req.body with the parsed value, so a client
		// cannot choose its own id or backdate a row by sending one.
		expect(result.data).toEqual({
			email: "test@example.com",
			name: "Test User",
		});
	});
});

describe("updateUserSchema", () => {
	it("should accept a single field", () => {
		const result = updateUserSchema.safeParse({ name: "New Name" });

		expect(result.success).toBe(true);
	});

	it("should still reject an invalid email", () => {
		const result = updateUserSchema.safeParse({ email: "nope" });

		expect(result.success).toBe(false);
	});
});

describe("userSchema", () => {
	it("should describe a row the way Prisma returns it", () => {
		const result = userSchema.safeParse({
			id: "00000000-0000-0000-0000-000000000000",
			email: "test@example.com",
			name: "Test User",
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		expect(result.success).toBe(true);
	});
});
