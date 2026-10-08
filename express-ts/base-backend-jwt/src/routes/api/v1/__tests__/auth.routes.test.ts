import { beforeAll, describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "../../../../test/app";
import { asUser, loginSession, TestSession } from "../../../../test/auth";

// Each response here also runs through responseCheck, which holds the body to
// the schema in openapi/paths/auth.ts.
describe("Auth Routes", () => {
	const app = createTestApp();
	let session: TestSession;

	beforeAll(async () => {
		session = await loginSession(app);
	});

	it("GET /auth/csrf-token hands out a token", async () => {
		const response = await request(app).get("/api/v1/auth/csrf-token");

		expect(response.status).toBe(200);
		expect(typeof response.body.csrfToken).toBe("string");
	});

	it("POST /auth/login rejects a malformed email", async () => {
		const response = await request(app)
			.post("/api/v1/auth/login")
			.send({ email: "nope", password: "password123" });

		expect(response.status).toBe(400);
	});

	it("GET /auth/me returns the token's claims", async () => {
		const response = await request(app)
			.get("/api/v1/auth/me")
			.set(asUser(session));

		expect(response.status).toBe(200);
		expect(response.body.user.email).toBe("user@example.com");
	});

	it("GET /auth/me refuses an anonymous caller", async () => {
		const response = await request(app).get("/api/v1/auth/me");

		expect(response.status).toBe(401);
	});

	it("POST /auth/refresh rotates the session", async () => {
		const response = await request(app)
			.post("/api/v1/auth/refresh")
			.set("Cookie", `refresh_token=${session.refreshToken}`);

		expect(response.status).toBe(200);
		expect(response.body.user).toBeUndefined();
	});

	it("POST /auth/refresh refuses a missing refresh token", async () => {
		const response = await request(app).post("/api/v1/auth/refresh");

		expect(response.status).toBe(401);
	});

	it("POST /auth/logout needs the CSRF token", async () => {
		const response = await request(app)
			.post("/api/v1/auth/logout")
			.set(asUser(session));

		expect(response.status).toBe(403);
	});

	it("POST /auth/logout clears the session", async () => {
		const response = await request(app)
			.post("/api/v1/auth/logout")
			.set({ ...asUser(session), "x-csrf-token": session.csrfToken });

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			success: true,
			message: "Logout successful",
		});
	});
});
