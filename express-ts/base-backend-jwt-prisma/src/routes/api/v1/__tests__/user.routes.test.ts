import { beforeEach, describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "../../../../test/app";
import { resetDatabase } from "../../../../test/db";
import { PASSWORD, asUser, signUp, withCsrf, type TestSession } from "../../../../test/auth";

describe("user routes", () => {
	const app = createTestApp();
	let session: TestSession;

	beforeEach(async () => {
		await resetDatabase();
		session = await signUp(app, "me@example.com", "Me");
	});

	describe("authentication", () => {
		it("refuses an anonymous request", async () => {
			const response = await request(app).get("/api/v1/users/me");

			expect(response.status).toBe(401);
			expect(response.body.code).toBe("UNAUTHENTICATED");
		});

		it("refuses a cookie that is not a token this server signed", async () => {
			const response = await request(app)
				.get("/api/v1/users/me")
				.set("Cookie", "access_token=eyJhbGciOiJub25lIn0.e30.");

			expect(response.status).toBe(401);
			expect(response.body.code).toBe("TOKEN_INVALID");
		});

		it("refuses a mutation without the CSRF header", async () => {
			const response = await request(app)
				.patch("/api/v1/users/me")
				.set(asUser(session))
				.send({ name: "Nope" });

			expect(response.status).toBe(403);
			expect(response.body.code).toBe("CSRF_INVALID");
		});
	});

	describe("GET /api/v1/users/me", () => {
		it("returns the account without the password hash", async () => {
			const response = await request(app).get("/api/v1/users/me").set(asUser(session));

			expect(response.status).toBe(200);
			expect(response.body.user).toEqual({
				id: session.userId,
				email: "me@example.com",
				name: "Me",
				createdAt: expect.any(String),
				updatedAt: expect.any(String),
			});
		});
	});

	describe("PATCH /api/v1/users/me", () => {
		it("changes the name", async () => {
			const response = await request(app)
				.patch("/api/v1/users/me")
				.set(withCsrf(session))
				.send({ name: "Renamed" });

			expect(response.status).toBe(200);
			expect(response.body.user).toMatchObject({ id: session.userId, name: "Renamed" });
		});

		it("answers 409 EMAIL_TAKEN when the new address belongs to someone else", async () => {
			await signUp(app, "other@example.com", "Other");

			const response = await request(app)
				.patch("/api/v1/users/me")
				.set(withCsrf(session))
				.send({ email: "other@example.com" });

			expect(response.status).toBe(409);
			expect(response.body.code).toBe("EMAIL_TAKEN");
		});

		it("refuses an empty patch and an unknown field", async () => {
			const empty = await request(app).patch("/api/v1/users/me").set(withCsrf(session)).send({});
			const unknown = await request(app)
				.patch("/api/v1/users/me")
				.set(withCsrf(session))
				.send({ passwordHash: "owned" });

			expect(empty.status).toBe(400);
			expect(unknown.status).toBe(400);
			expect(unknown.body.code).toBe("VALIDATION_ERROR");
		});
	});

	describe("DELETE /api/v1/users/me", () => {
		it("refuses the wrong password", async () => {
			const response = await request(app)
				.delete("/api/v1/users/me")
				.set(withCsrf(session))
				.send({ password: "not-the-password" });

			expect(response.status).toBe(401);
			expect(response.body.code).toBe("INVALID_CREDENTIALS");
		});

		it("closes the account, after which the token in hand names nobody", async () => {
			const response = await request(app)
				.delete("/api/v1/users/me")
				.set(withCsrf(session))
				.send({ password: PASSWORD });

			expect(response.status).toBe(204);

			// The access token is still signed and unexpired; the row is gone.
			const afterwards = await request(app).get("/api/v1/users/me").set(asUser(session));
			expect(afterwards.status).toBe(401);
			expect(afterwards.body.code).toBe("UNAUTHENTICATED");

			// The refresh family went with the row, by cascade.
			const refresh = await request(app)
				.post("/api/v1/auth/refresh")
				.set("Cookie", `refresh_token=${session.refreshToken}`);
			expect(refresh.status).toBe(401);
		});
	});

	describe("GET /api/v1/users", () => {
		it("pages oldest first by cursor, and a short page is the end", async () => {
			const second = await signUp(app, "second@example.com", "Second");
			const third = await signUp(app, "third@example.com", "Third");

			const page1 = await request(app).get("/api/v1/users?limit=2").set(asUser(session));
			expect(page1.status).toBe(200);
			expect(page1.body.users.map((user: { id: string }) => user.id)).toEqual([
				session.userId,
				second.userId,
			]);

			const page2 = await request(app)
				.get(`/api/v1/users?limit=2&cursor=${second.userId}`)
				.set(asUser(session));
			expect(page2.body.users.map((user: { id: string }) => user.id)).toEqual([third.userId]);

			const page3 = await request(app)
				.get(`/api/v1/users?limit=2&cursor=${third.userId}`)
				.set(asUser(session));
			expect(page3.body.users).toEqual([]);
		});

		it("shows nobody's email", async () => {
			const response = await request(app).get("/api/v1/users").set(asUser(session));

			expect(response.body.users).toEqual([
				{ id: session.userId, name: "Me", createdAt: expect.any(String) },
			]);
		});

		it("caps the page size on the server", async () => {
			const response = await request(app).get("/api/v1/users?limit=1000").set(asUser(session));

			expect(response.status).toBe(400);
			expect(response.body.details[0].field).toBe("query.limit");
		});
	});

	describe("GET /api/v1/users/:id", () => {
		it("returns the public profile", async () => {
			const response = await request(app)
				.get(`/api/v1/users/${session.userId}`)
				.set(asUser(session));

			expect(response.status).toBe(200);
			expect(response.body.user).toEqual({
				id: session.userId,
				name: "Me",
				createdAt: expect.any(String),
			});
		});

		it("answers 400 for an id that is not a uuid", async () => {
			const response = await request(app).get("/api/v1/users/invalid-id").set(asUser(session));

			expect(response.status).toBe(400);
			expect(response.body.details[0].field).toBe("params.id");
		});

		it("answers 404 for a user that is not there", async () => {
			const response = await request(app)
				.get("/api/v1/users/00000000-0000-0000-0000-000000000000")
				.set(asUser(session));

			expect(response.status).toBe(404);
			expect(response.body.code).toBe("NOT_FOUND");
		});
	});
});
