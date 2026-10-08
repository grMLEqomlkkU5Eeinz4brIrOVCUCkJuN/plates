import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "../../../../test/app";

describe("User Routes", () => {
	const app = createTestApp();

	describe("POST /api/v1/users", () => {
		it("should create a user with valid data", async () => {
			const response = await request(app).post("/api/v1/users").send({
				email: "test@example.com",
				name: "Test User",
			});

			expect(response.status).toBe(201);
			expect(response.body).toMatchObject({
				email: "test@example.com",
				name: "Test User",
			});
			expect(response.body.id).toBeDefined();
		});

		it("should reject invalid email", async () => {
			const response = await request(app).post("/api/v1/users").send({
				email: "invalid",
				name: "Test User",
			});

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
		});

		it("should reject missing name", async () => {
			const response = await request(app).post("/api/v1/users").send({
				email: "test@example.com",
			});

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
		});
	});

	describe("GET /api/v1/users", () => {
		it("returns the first page with the default limit", async () => {
			const response = await request(app).get("/api/v1/users");

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({ limit: 20, offset: 0 });
			expect(Array.isArray(response.body.items)).toBe(true);
		});

		it("pages by limit and offset", async () => {
			for (const name of ["A", "B", "C"]) {
				await request(app)
					.post("/api/v1/users")
					.send({ email: `${name}@example.com`, name });
			}
			const before = (await request(app).get("/api/v1/users?limit=100"))
				.body.total as number;

			const response = await request(app).get(
				`/api/v1/users?limit=2&offset=${before - 3}`
			);

			expect(response.status).toBe(200);
			expect(response.body.total).toBe(before);
			expect(
				response.body.items.map((u: { name: string }) => u.name)
			).toEqual(["A", "B"]);
		});

		it("returns an empty page past the end", async () => {
			const response = await request(app).get(
				"/api/v1/users?offset=100000"
			);

			expect(response.status).toBe(200);
			expect(response.body.items).toEqual([]);
		});

		it.each(["limit=0", "limit=101", "limit=1.5", "offset=-1", "limit=x"])(
			"rejects %s",
			async (query) => {
				const response = await request(app).get(
					`/api/v1/users?${query}`
				);

				expect(response.status).toBe(400);
			}
		);

		it("accepts limit=100", async () => {
			const response = await request(app).get("/api/v1/users?limit=100");

			expect(response.status).toBe(200);
			expect(response.body.limit).toBe(100);
		});
	});

	describe("GET /api/v1/users/:id", () => {
		it("should return 400 for invalid uuid", async () => {
			const response = await request(app).get("/api/v1/users/invalid-id");

			expect(response.status).toBe(400);
		});

		it("should return 404 for non-existent user", async () => {
			const response = await request(app).get(
				"/api/v1/users/00000000-0000-0000-0000-000000000000"
			);

			expect(response.status).toBe(404);
		});
	});

	describe("PATCH /api/v1/users/:id", () => {
		it("should update user", async () => {
			// First create a user
			const createResponse = await request(app)
				.post("/api/v1/users")
				.send({
					email: "update@example.com",
					name: "Original Name",
				});

			const userId = createResponse.body.id;

			// Then update
			const response = await request(app)
				.patch(`/api/v1/users/${userId}`)
				.send({
					name: "Updated Name",
				});

			expect(response.status).toBe(200);
			expect(response.body.name).toBe("Updated Name");
			expect(response.body.email).toBe("update@example.com");
		});
	});

	describe("DELETE /api/v1/users/:id", () => {
		it("should delete user", async () => {
			// First create a user
			const createResponse = await request(app)
				.post("/api/v1/users")
				.send({
					email: "delete@example.com",
					name: "To Delete",
				});

			const userId = createResponse.body.id;

			// Then delete
			const response = await request(app).delete(
				`/api/v1/users/${userId}`
			);

			expect(response.status).toBe(204);

			// Verify deleted
			const getResponse = await request(app).get(
				`/api/v1/users/${userId}`
			);
			expect(getResponse.status).toBe(404);
		});
	});
});
