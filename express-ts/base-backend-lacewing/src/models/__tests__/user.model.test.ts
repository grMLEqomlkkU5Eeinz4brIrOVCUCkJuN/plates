import { createUser, updateUser, createUserSchema } from "../user.model";

describe("User Model", () => {
	describe("createUser", () => {
		it("should create a user with generated id and timestamps", () => {
			const user = createUser({
				email: "test@example.com",
				name: "Test User",
			});

			expect(user.id).toBeDefined();
			expect(user.email).toBe("test@example.com");
			expect(user.name).toBe("Test User");
			expect(user.createdAt).toBeInstanceOf(Date);
			expect(user.updatedAt).toBeInstanceOf(Date);
		});
	});

	describe("updateUser", () => {
		it("should update email and updatedAt", () => {
			const user = createUser({
				email: "old@example.com",
				name: "Test User",
			});

			const updated = updateUser(user, { email: "new@example.com" });

			expect(updated.email).toBe("new@example.com");
			expect(updated.name).toBe("Test User");
			expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
				user.updatedAt.getTime()
			);
			// Original is unchanged (immutable)
			expect(user.email).toBe("old@example.com");
		});

		it("should update name only", () => {
			const user = createUser({
				email: "test@example.com",
				name: "Old Name",
			});

			const updated = updateUser(user, { name: "New Name" });

			expect(updated.email).toBe("test@example.com");
			expect(updated.name).toBe("New Name");
		});
	});
});

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
});
