import { beforeAll, describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "../../../../test/app";
import { asUser, loginSession, TestSession } from "../../../../test/auth";

describe("User Routes", () => {
	const app = createTestApp();
	let session: TestSession;

	beforeAll(async () => {
		session = await loginSession(app);
	});

	const authed = (): Record<string, string> => asUser(session);
	const csrf = (): Record<string, string> => ({
		...authed(),
		"x-csrf-token": session.csrfToken,
	});

	describe("authentication", () => {
		it("should reject anonymous requests", async () => {
			const response = await request(app).get("/api/v1/users");

			expect(response.status).toBe(401);
		});

		it("should reject mutations without a CSRF token", async () => {
			const response = await request(app)
				.post("/api/v1/users")
				.set(authed())
				.send({ email: "test@example.com", name: "Test User" });

			expect(response.status).toBe(403);
		});
	});

	describe("POST /api/v1/users", () => {
		it("should create a user with valid data", async () => {
			const response = await request(app)
				.post("/api/v1/users")
				.set(csrf())
				.send({
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
			const response = await request(app)
				.post("/api/v1/users")
				.set(csrf())
				.send({
					email: "invalid",
					name: "Test User",
				});

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
		});

		it("should reject missing name", async () => {
			const response = await request(app)
				.post("/api/v1/users")
				.set(csrf())
				.send({
					email: "test@example.com",
				});

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
		});
	});

	describe("GET /api/v1/users", () => {
		it("should return array of users", async () => {
			const response = await request(app)
				.get("/api/v1/users")
				.set(authed());

			expect(response.status).toBe(200);
			expect(Array.isArray(response.body.items)).toBe(true);
		});
	});

	describe("GET /api/v1/users pagination", () => {
		const page = (query: string): request.Test =>
			request(app).get(`/api/v1/users${query}`).set(authed());

		beforeAll(async () => {
			const existing = await page("?limit=100");
			for (let n = existing.body.total; n < 25; n++) {
				await request(app)
					.post("/api/v1/users")
					.set(csrf())
					.send({ email: `page${n}@example.com`, name: `Page ${n}` });
			}
		});

		it("defaults to 20 users", async () => {
			const response = await page("");

			expect(response.status).toBe(200);
			expect(response.body.items).toHaveLength(20);
			expect(response.body).toMatchObject({ total: 25, limit: 20, offset: 0 });
		});

		it("returns the rest after an offset", async () => {
			const all = await page("?limit=100");
			const response = await page("?offset=20&limit=100");

			expect(response.body.items).toEqual(all.body.items.slice(20));
			expect(response.body).toMatchObject({ total: 25, limit: 100, offset: 20 });
		});

		it("returns nothing past the end", async () => {
			const response = await page("?offset=1000");

			expect(response.status).toBe(200);
			expect(response.body.items).toEqual([]);
			expect(response.body.total).toBe(25);
		});

		it.each(["?limit=0", "?limit=101", "?limit=abc", "?offset=-1", "?limit=1.5"])(
			"rejects %s",
			async (query) => {
				const response = await page(query);

				expect(response.status).toBe(400);
			}
		);

		it("accepts the bounds 1 and 100", async () => {
			expect((await page("?limit=1")).body.items).toHaveLength(1);
			expect((await page("?limit=100")).status).toBe(200);
		});
	});

	describe("GET /api/v1/users/:id", () => {
		it("should return 400 for invalid uuid", async () => {
			const response = await request(app)
				.get("/api/v1/users/invalid-id")
				.set(authed());

			expect(response.status).toBe(400);
		});

		it("should return 404 for non-existent user", async () => {
			const response = await request(app)
				.get("/api/v1/users/00000000-0000-0000-0000-000000000000")
				.set(authed());

			expect(response.status).toBe(404);
		});
	});

	describe("PATCH /api/v1/users/:id", () => {
		it("should update user", async () => {
			// First create a user
			const createResponse = await request(app)
				.post("/api/v1/users")
				.set(csrf())
				.send({
					email: "update@example.com",
					name: "Original Name",
				});

			const userId = createResponse.body.id;

			// Then update
			const response = await request(app)
				.patch(`/api/v1/users/${userId}`)
				.set(csrf())
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
				.set(csrf())
				.send({
					email: "delete@example.com",
					name: "To Delete",
				});

			const userId = createResponse.body.id;

			// Then delete
			const response = await request(app)
				.delete(`/api/v1/users/${userId}`)
				.set(csrf());

			expect(response.status).toBe(204);

			// Verify deleted
			const getResponse = await request(app)
				.get(`/api/v1/users/${userId}`)
				.set(authed());
			expect(getResponse.status).toBe(404);
		});
	});
});
