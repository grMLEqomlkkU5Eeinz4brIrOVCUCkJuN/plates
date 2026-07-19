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
			expect(Array.isArray(response.body)).toBe(true);
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
