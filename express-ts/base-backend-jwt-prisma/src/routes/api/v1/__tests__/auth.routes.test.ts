import { beforeEach, describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "../../../../test/app";
import { resetDatabase } from "../../../../test/db";
import { PASSWORD, asUser, cookiePairs, cookieValue, signUp, withCsrf } from "../../../../test/auth";

/**
 * Runs against the real database, migrated by `prisma migrate deploy`: what
 * these prove is that the rows the auth service writes are the rows it reads
 * back, which no fake could.
 */
describe("auth routes", () => {
	const app = createTestApp();

	beforeEach(resetDatabase);

	describe("POST /api/v1/auth/register", () => {
		it("creates the account and opens a session", async () => {
			const response = await request(app)
				.post("/api/v1/auth/register")
				.send({ email: "New.User@Example.com", name: "New User", password: PASSWORD });

			expect(response.status).toBe(201);
			// Lowercased on the way in, so a second registration with different
			// casing is the same address and answers 409.
			expect(response.body.user).toMatchObject({ email: "new.user@example.com", name: "New User" });
			expect(response.body.user.passwordHash).toBeUndefined();
			expect(typeof response.body.csrfToken).toBe("string");

			const cookies = cookiePairs(response.get("Set-Cookie") ?? []);
			expect(cookieValue(cookies, "access_token")).not.toBe("");
			expect(cookieValue(cookies, "refresh_token")).not.toBe("");
		});

		it("answers 409 EMAIL_TAKEN for an address that is already registered", async () => {
			await signUp(app, "taken@example.com");

			const response = await request(app)
				.post("/api/v1/auth/register")
				.send({ email: "TAKEN@example.com", name: "Again", password: PASSWORD });

			expect(response.status).toBe(409);
			expect(response.body).toMatchObject({ success: false, code: "EMAIL_TAKEN" });
			expect(typeof response.body.requestId).toBe("string");
		});

		it("refuses a short password with field-level detail", async () => {
			const response = await request(app)
				.post("/api/v1/auth/register")
				.send({ email: "short@example.com", name: "Short", password: "tooshort" });

			expect(response.status).toBe(400);
			expect(response.body.code).toBe("VALIDATION_ERROR");
			expect(response.body.details).toEqual([
				{ field: "body.password", message: "Passwords must be at least 10 characters." },
			]);
		});

		it("refuses an unknown field rather than dropping it", async () => {
			const response = await request(app)
				.post("/api/v1/auth/register")
				.send({ email: "extra@example.com", name: "Extra", password: PASSWORD, passwordHash: "x" });

			expect(response.status).toBe(400);
			expect(response.body.details[0].field).toBe("body");
		});

		it("refuses a body that is not JSON as MALFORMED_BODY", async () => {
			const response = await request(app)
				.post("/api/v1/auth/register")
				.set("Content-Type", "application/json")
				.send("{not json");

			expect(response.status).toBe(400);
			expect(response.body.code).toBe("MALFORMED_BODY");
		});
	});

	describe("POST /api/v1/auth/login", () => {
		beforeEach(async () => {
			await signUp(app, "login@example.com");
		});

		it("opens a session for the right password", async () => {
			const response = await request(app)
				.post("/api/v1/auth/login")
				.send({ email: "login@example.com", password: PASSWORD });

			expect(response.status).toBe(200);
			expect(response.body.user.email).toBe("login@example.com");
			// The session pair, and the CSRF cookie the returned token is bound to.
			const names = cookiePairs(response.get("Set-Cookie") ?? []).map((pair) => pair.split("=")[0]);
			expect(names.sort()).toEqual(["__csrf", "access_token", "refresh_token"]);
		});

		it("answers the same 401 for a wrong password and an unknown address", async () => {
			const wrong = await request(app)
				.post("/api/v1/auth/login")
				.send({ email: "login@example.com", password: "not-the-password" });
			const unknown = await request(app)
				.post("/api/v1/auth/login")
				.send({ email: "nobody@example.com", password: PASSWORD });

			expect(wrong.status).toBe(401);
			expect(unknown.status).toBe(401);
			expect(wrong.body.code).toBe("INVALID_CREDENTIALS");
			expect(unknown.body.message).toBe(wrong.body.message);
		});

		it("rate limits the address after RATE_LIMIT_MAX attempts", async () => {
			for (let attempt = 0; attempt < 5; attempt++) {
				await request(app)
					.post("/api/v1/auth/login")
					.send({ email: "login@example.com", password: "wrong-every-time" });
			}

			// The right password is refused too: the limit is on attempts, not
			// on failures, or it would be a signal about which guess was right.
			const response = await request(app)
				.post("/api/v1/auth/login")
				.send({ email: "login@example.com", password: PASSWORD });

			expect(response.status).toBe(429);
			expect(response.body.code).toBe("RATE_LIMITED");
			expect(response.get("Retry-After")).toBe("900");
		});
	});

	describe("POST /api/v1/auth/refresh", () => {
		const refreshWith = (refreshToken: string): request.Test =>
			request(app)
				.post("/api/v1/auth/refresh")
				.set("Cookie", `refresh_token=${refreshToken}`);

		it("rotates the pair, and the spent token revokes the family on reuse", async () => {
			const session = await signUp(app, "refresh@example.com");

			const first = await refreshWith(session.refreshToken);
			expect(first.status).toBe(200);
			expect(typeof first.body.csrfToken).toBe("string");

			const rotated = cookiePairs(first.get("Set-Cookie") ?? []);
			const nextRefresh = cookieValue(rotated, "refresh_token");
			expect(nextRefresh).not.toBe("");
			expect(nextRefresh).not.toBe(session.refreshToken);

			// A client that lost the first response, or a thief: same answer.
			const replay = await refreshWith(session.refreshToken);
			expect(replay.status).toBe(401);
			expect(replay.body.code).toBe("REFRESH_REUSED");

			// The token the honest client holds is dead too, because the family is.
			const afterReplay = await refreshWith(nextRefresh);
			expect(afterReplay.status).toBe(401);
			expect(afterReplay.body.code).toBe("REFRESH_INVALID");
		});

		it("answers 401 REFRESH_INVALID and clears the cookies for a token it has never seen", async () => {
			const response = await refreshWith("not-a-token-anyone-issued");

			expect(response.status).toBe(401);
			expect(response.body.code).toBe("REFRESH_INVALID");

			const cleared = response.get("Set-Cookie") ?? [];
			expect(cleared.some((cookie) => cookie.startsWith("access_token=;"))).toBe(true);
			expect(cleared.some((cookie) => cookie.startsWith("refresh_token=;"))).toBe(true);
		});

		it("answers 401 without a refresh cookie", async () => {
			const response = await request(app).post("/api/v1/auth/refresh");

			expect(response.status).toBe(401);
			expect(response.body.code).toBe("REFRESH_INVALID");
		});
	});

	describe("POST /api/v1/auth/logout", () => {
		it("revokes the session the access token names", async () => {
			const session = await signUp(app, "logout@example.com");

			const response = await request(app).post("/api/v1/auth/logout").set(withCsrf(session));
			expect(response.status).toBe(204);

			const afterLogout = await request(app)
				.post("/api/v1/auth/refresh")
				.set("Cookie", `refresh_token=${session.refreshToken}`);
			expect(afterLogout.status).toBe(401);
			expect(afterLogout.body.code).toBe("REFRESH_INVALID");
		});

		it("refuses a mutation without the CSRF header", async () => {
			const session = await signUp(app, "csrf@example.com");

			const response = await request(app).post("/api/v1/auth/logout").set(asUser(session));

			expect(response.status).toBe(403);
			expect(response.body.code).toBe("CSRF_INVALID");
		});

		it("refuses an anonymous caller", async () => {
			const response = await request(app).post("/api/v1/auth/logout");

			expect(response.status).toBe(401);
			expect(response.body.code).toBe("UNAUTHENTICATED");
		});
	});

	describe("the request id", () => {
		it("is echoed back, and an upstream one is kept", async () => {
			const generated = await request(app).get("/api/v1/health");
			expect(generated.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);

			const forwarded = await request(app)
				.get("/api/v1/nowhere")
				.set("X-Request-Id", "trace-abc.123");
			expect(forwarded.status).toBe(404);
			expect(forwarded.get("X-Request-Id")).toBe("trace-abc.123");
			expect(forwarded.body.requestId).toBe("trace-abc.123");
		});

		it("replaces one that could not go in a log line", async () => {
			const response = await request(app)
				.get("/api/v1/health")
				.set("X-Request-Id", "has spaces and \"quotes\"");

			expect(response.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
		});
	});
});
