import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "../../../../test/app";
import { asUser, cookiePairs, loginSession } from "../../../../test/auth";

/**
 * These tests double as a demo of what lacewing guarantees: hardened
 * cookies, revocation that actually revokes, refresh rotation, and the
 * access/refresh `typ` split that makes token confusion fail.
 */
describe("Auth Routes", () => {
	const app = createTestApp();

	describe("POST /api/v1/auth/login", () => {
		it("sets HttpOnly; Secure auth cookies and returns a CSRF token", async () => {
			const response = await request(app)
				.post("/api/v1/auth/login")
				.send({ email: "user@example.com", password: "password123" });

			expect(response.status).toBe(200);
			expect(response.body.csrfToken).toBeDefined();
			// No token in the body - the browser-readable surface holds nothing worth stealing.
			expect(JSON.stringify(response.body)).not.toContain("eyJ");

			const setCookies: string[] = response.get("Set-Cookie") ?? [];
			const authCookies = setCookies.filter(
				(cookie) =>
					cookie.startsWith("access_token=") ||
					cookie.startsWith("refresh_token=")
			);
			expect(authCookies).toHaveLength(2);
			for (const cookie of authCookies) {
				// lacewing's buildTokenCookie - weaker attributes are unrepresentable.
				expect(cookie).toContain("HttpOnly");
				expect(cookie).toContain("Secure");
				expect(cookie).toMatch(/SameSite=(Lax|Strict)/);
			}

			// The refresh token only ever travels to the refresh endpoint.
			const refreshCookie = setCookies.find((cookie) =>
				cookie.startsWith("refresh_token=")
			);
			expect(refreshCookie).toContain("Path=/api/v1/auth/refresh");
		});
	});

	describe("GET /api/v1/auth/me", () => {
		it("returns the verified token's claims", async () => {
			const session = await loginSession(app, "me@example.com");

			const response = await request(app)
				.get("/api/v1/auth/me")
				.set(asUser(session));

			expect(response.status).toBe(200);
			expect(response.body.user.email).toBe("me@example.com");
			expect(response.body.user.userId).toBeDefined();
			expect(response.body.user.jti).toBeDefined();
		});

		it("rejects anonymous requests", async () => {
			const response = await request(app).get("/api/v1/auth/me");

			expect(response.status).toBe(401);
		});

		it("accepts the access token as a bearer header (RFC 6750)", async () => {
			const session = await loginSession(app);

			const response = await request(app)
				.get("/api/v1/auth/me")
				.set("Authorization", `Bearer ${session.accessToken}`);

			expect(response.status).toBe(200);
		});

		it("rejects a malformed bearer header - strict parsing, no second token", async () => {
			const session = await loginSession(app);

			const response = await request(app)
				.get("/api/v1/auth/me")
				.set(
					"Authorization",
					`Bearer ${session.accessToken} ${session.accessToken}`
				);

			expect(response.status).toBe(401);
		});

		it("rejects a tampered token", async () => {
			const session = await loginSession(app);
			const [header, payload] = session.accessToken.split(".");
			const forged = `${header}.${payload}.${"A".repeat(43)}`;

			const response = await request(app)
				.get("/api/v1/auth/me")
				.set("Cookie", `access_token=${forged}`);

			expect(response.status).toBe(401);
		});

		it("rejects a refresh token used as an access token (typ confusion)", async () => {
			const session = await loginSession(app);

			// Same key family, same claims, valid signature - but typ is
			// rt+jwt and the audience is the refresh endpoint, and the
			// access profile refuses both.
			const response = await request(app)
				.get("/api/v1/auth/me")
				.set("Cookie", `access_token=${session.refreshToken}`);

			expect(response.status).toBe(401);
		});
	});

	describe("POST /api/v1/auth/refresh", () => {
		it("rotates the session and revokes the used refresh token", async () => {
			const session = await loginSession(app);

			const first = await request(app)
				.post("/api/v1/auth/refresh")
				.set(asUser(session));

			expect(first.status).toBe(200);
			expect(first.body.csrfToken).toBeDefined();

			const rotated = cookiePairs(first.get("Set-Cookie") ?? []);
			expect(
				rotated.find((pair) => pair.startsWith("access_token="))
			).not.toBe(`access_token=${session.accessToken}`);

			// Replaying the old refresh token: it was revoked by jti the
			// moment it was redeemed. Whoever refreshes second loses.
			const replay = await request(app)
				.post("/api/v1/auth/refresh")
				.set(asUser(session));

			expect(replay.status).toBe(401);
		});

		it("rejects a missing refresh token", async () => {
			const response = await request(app).post("/api/v1/auth/refresh");

			expect(response.status).toBe(401);
		});
	});

	describe("POST /api/v1/auth/logout", () => {
		it("revokes the access token immediately, not at expiry", async () => {
			const session = await loginSession(app);

			const logout = await request(app)
				.post("/api/v1/auth/logout")
				.set(asUser(session))
				.set("x-csrf-token", session.csrfToken);

			expect(logout.status).toBe(200);

			// The cookie is cleared client-side, but an attacker who copied
			// the token does not clear theirs: the revocation store is what
			// makes this 401 instead of a valid session until exp.
			const replay = await request(app)
				.get("/api/v1/auth/me")
				.set("Cookie", `access_token=${session.accessToken}`);

			expect(replay.status).toBe(401);
		});

		it("requires a CSRF token", async () => {
			const session = await loginSession(app);

			const response = await request(app)
				.post("/api/v1/auth/logout")
				.set(asUser(session));

			expect(response.status).toBe(403);
		});
	});

	describe("GET /api/v1/auth/csrf-token", () => {
		it("hands out a CSRF token", async () => {
			const response = await request(app).get("/api/v1/auth/csrf-token");

			expect(response.status).toBe(200);
			expect(response.body.csrfToken).toBeDefined();
		});
	});
});
