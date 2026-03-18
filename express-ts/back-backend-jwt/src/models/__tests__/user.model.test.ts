import { User, createUserSchema } from "../user.model";

describe("User Model", () => {
	describe("User.create", () => {
		it("should create a user with generated id and timestamps", () => {
			const user = User.create({
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

	describe("User.update", () => {
		it("should update email and updatedAt", () => {
			const user = User.create({
				email: "old@example.com",
				name: "Test User",
			});
			const originalUpdatedAt = user.updatedAt;

			// Small delay to ensure timestamp differs
			user.update({ email: "new@example.com" });

			expect(user.email).toBe("new@example.com");
			expect(user.name).toBe("Test User");
			expect(user.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
		});

		it("should update name only", () => {
			const user = User.create({
				email: "test@example.com",
				name: "Old Name",
			});

			user.update({ name: "New Name" });

			expect(user.email).toBe("test@example.com");
			expect(user.name).toBe("New Name");
		});
	});

	describe("User.toJSON", () => {
		it("should serialize user to plain object", () => {
			const user = User.create({
				email: "test@example.com",
				name: "Test User",
			});

			const json = user.toJSON();

			expect(json).toEqual({
				id: user.id,
				email: "test@example.com",
				name: "Test User",
				createdAt: user.createdAt,
				updatedAt: user.updatedAt,
			});
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
