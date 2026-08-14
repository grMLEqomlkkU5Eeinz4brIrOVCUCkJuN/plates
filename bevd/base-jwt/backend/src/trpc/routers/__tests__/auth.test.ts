import { beforeEach, describe, expect, it } from "vitest";
import { verifyAccessToken } from "../../../auth/jwt";
import type { Database } from "../../../db";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "../../../http/cookies";
import { callerWithHeaders } from "../../../test/context";
import { createTestDatabase } from "../../../test/db";

function cookiesFrom(headers: Headers): Record<string, string> {
	return Object.fromEntries(
		headers
			.getSetCookie()
			.map((cookie) => cookie.split(";")[0]?.split("=") ?? [])
			.map(([name, value]) => [name ?? "", value ?? ""]),
	);
}

const ALICE = { email: "alice@example.com", name: "Alice", password: "password123" };

describe("auth", () => {
	let db: Database;

	beforeEach(async () => {
		db = await createTestDatabase();
	});

	it("registers a user, sets httpOnly cookies, and never returns the hash", async () => {
		const { trpc, resHeaders } = callerWithHeaders(db);

		const user = await trpc.auth.register({ ...ALICE, email: "Alice@Example.com" });

		// Email is normalised, so Alice@ and alice@ are the same account.
		expect(user.email).toBe("alice@example.com");
		expect(user.role).toBe("user");
		expect(user).not.toHaveProperty("passwordHash");

		const setCookies = resHeaders.getSetCookie();
		expect(setCookies.some((c) => c.startsWith(`${ACCESS_COOKIE}=`))).toBe(true);
		expect(setCookies.some((c) => c.startsWith(`${REFRESH_COOKIE}=`))).toBe(true);
		// The whole point: script in the page cannot read these.
		expect(setCookies.every((c) => c.includes("HttpOnly"))).toBe(true);

		// The tokens are in the cookies, not in the response body.
		expect(user).not.toHaveProperty("accessToken");
	});

	it("issues an access token that carries the user's id and role", async () => {
		const { trpc, resHeaders } = callerWithHeaders(db);

		const user = await trpc.auth.register(ALICE);

		const token = cookiesFrom(resHeaders)[ACCESS_COOKIE];
		const payload = await verifyAccessToken(token ?? "");

		expect(payload).toMatchObject({ sub: user.id, email: "alice@example.com", role: "user" });
	});

	it("cannot be tricked into registering an admin", async () => {
		const { trpc } = callerWithHeaders(db);

		// The extra field is not in the schema, so it never reaches the insert.
		const user = await trpc.auth.register({
			...ALICE,
			email: "sneaky@example.com",
			role: "admin",
		} as never);

		expect(user.role).toBe("user");
	});

	it("refuses a duplicate email", async () => {
		const { trpc } = callerWithHeaders(db);

		await trpc.auth.register(ALICE);

		await expect(trpc.auth.register(ALICE)).rejects.toMatchObject({ code: "CONFLICT" });
	});

	it("refuses a duplicate even when two registrations race", async () => {
		const { trpc } = callerWithHeaders(db);

		// There is no "is this taken?" check to lose the race against - the UNIQUE index
		// decides, and the loser is translated into a CONFLICT rather than blowing up as
		// an unhandled 500.
		const results = await Promise.allSettled([
			trpc.auth.register(ALICE),
			trpc.auth.register(ALICE),
			trpc.auth.register(ALICE),
		]);

		const fulfilled = results.filter((r) => r.status === "fulfilled");
		const rejected = results.filter((r) => r.status === "rejected");

		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(2);

		for (const failure of rejected) {
			expect(failure.reason).toMatchObject({ code: "CONFLICT" });
		}
	});

	it("gives the same error for a wrong password and an unknown email", async () => {
		const { trpc } = callerWithHeaders(db);

		await trpc.auth.register(ALICE);

		// Identical, so login cannot be used to discover which emails have accounts.
		// (Each call is asserted where it is made: holding a rejected promise around for
		// later reads to vitest as an unhandled rejection.)
		await expect(
			trpc.auth.login({ email: "alice@example.com", password: "nope12345" }),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "Invalid email or password",
		});

		await expect(
			trpc.auth.login({ email: "ghost@example.com", password: "password123" }),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "Invalid email or password",
		});
	});

	it("logs in with the right password", async () => {
		const { trpc } = callerWithHeaders(db);

		await trpc.auth.register(ALICE);

		await expect(
			trpc.auth.login({ email: "alice@example.com", password: "password123" }),
		).resolves.toMatchObject({ email: "alice@example.com" });
	});

	it("rotates the refresh token, and the old one stops working", async () => {
		const registration = callerWithHeaders(db);
		await registration.trpc.auth.register(ALICE);

		const firstToken = cookiesFrom(registration.resHeaders)[REFRESH_COOKIE];
		expect(firstToken).toBeTruthy();

		const first = callerWithHeaders(db, { refreshToken: firstToken });
		await first.trpc.auth.refresh();

		const secondToken = cookiesFrom(first.resHeaders)[REFRESH_COOKIE];
		expect(secondToken).toBeTruthy();
		expect(secondToken).not.toBe(firstToken);

		// Replaying the old token - what a thief would have - is dead on arrival.
		const replay = callerWithHeaders(db, { refreshToken: firstToken });
		await expect(replay.trpc.auth.refresh()).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		// The new one still works.
		const third = callerWithHeaders(db, { refreshToken: secondToken });
		await expect(third.trpc.auth.refresh()).resolves.toMatchObject({
			email: "alice@example.com",
		});
	});

	it("revokes the refresh token on logout and clears the cookies", async () => {
		const registration = callerWithHeaders(db);
		await registration.trpc.auth.register(ALICE);

		const token = cookiesFrom(registration.resHeaders)[REFRESH_COOKIE];

		const session = callerWithHeaders(db, { refreshToken: token });
		await session.trpc.auth.logout();

		// Cookies are expired, not merely forgotten by the client.
		const cleared = session.resHeaders.getSetCookie();
		expect(cleared.every((c) => c.includes("Max-Age=0"))).toBe(true);

		const stored = await db.query.refreshTokens.findFirst();
		expect(stored?.revokedAt).toBeInstanceOf(Date);

		await expect(
			callerWithHeaders(db, { refreshToken: token }).trpc.auth.refresh(),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("rejects auth.me without a session", async () => {
		await expect(callerWithHeaders(db).trpc.auth.me()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});
});
