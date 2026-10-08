import { beforeAll, describe, expect, it } from "@jest/globals";
import jwt from "jsonwebtoken";
import request from "supertest";
import { env } from "../../../../config/env";
import { generateRefreshToken } from "../../../../middleware/auth";
import { createTestApp } from "../../../../test/app";
import {
	asUser,
	cookiePairs,
	loginSession,
	TestSession,
} from "../../../../test/auth";

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
			.set({ ...asUser(session), "x-csrf-token": session.csrfToken });

		expect(response.status).toBe(200);
		expect(response.body.user).toBeUndefined();
	});

	// The case refresh exists for: the access token has expired, and the CSRF
	// token is bound to that expired token's cookie, which must still be sent.
	it("POST /auth/refresh works once the access token has expired", async () => {
		const claims = { userId: "user-1", email: "user@example.com" };
		const expired = jwt.sign(
			{ ...claims, exp: Math.floor(Date.now() / 1000) - 60 },
			env.JWT_SECRET
		);
		const issued = await request(app)
			.get("/api/v1/auth/csrf-token")
			.set("Cookie", `access_token=${expired}`);

		const response = await request(app)
			.post("/api/v1/auth/refresh")
			.set({
				Cookie: [
					`access_token=${expired}`,
					`refresh_token=${generateRefreshToken(claims)}`,
					...cookiePairs(issued.get("Set-Cookie") ?? []),
				].join("; "),
				"x-csrf-token": issued.body.csrfToken,
			});

		expect(response.status).toBe(200);
	});

	it("POST /auth/refresh refuses a POST without the CSRF token", async () => {
		const response = await request(app)
			.post("/api/v1/auth/refresh")
			.set(asUser(session));

		expect(response.status).toBe(403);
		expect(response.get("Set-Cookie")).toBeUndefined();
	});

	it("POST /auth/refresh refuses a missing refresh token", async () => {
		const cookies = session.cookies.filter(
			(c) => !c.startsWith("refresh_token=")
		);
		const response = await request(app)
			.post("/api/v1/auth/refresh")
			.set({ Cookie: cookies.join("; "), "x-csrf-token": session.csrfToken });

		expect(response.status).toBe(401);
	});

	it("keeps the access cookie as long as the refresh cookie", async () => {
		const response = await request(app)
			.post("/api/v1/auth/login")
			.send({ email: "user@example.com", password: "password123" });
		const maxAge = (name: string): string | undefined =>
			(response.get("Set-Cookie") ?? [])
				.find((c) => c.startsWith(`${name}=`))
				?.match(/Max-Age=(\d+)/)?.[1];

		// JWT_REFRESH_EXPIRY defaults to 7d.
		expect(maxAge("access_token")).toBe("604800");
		expect(maxAge("refresh_token")).toBe("604800");
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
