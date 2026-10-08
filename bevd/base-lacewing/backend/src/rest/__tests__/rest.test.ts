import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../../db";
import type { Post, PublicUser } from "../../db/schema";
import { ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE } from "../../http/cookies";
import { accessTokenFor, seedUser } from "../../test/auth";
import { createTestDatabase } from "../../test/db";
import { checkedApp } from "../../test/http";

/**
 * The REST twins over app.handle(), every response checked against the OpenAPI
 * description on the way (test/http.ts). The service rules themselves are covered by the
 * tRPC tests; these prove the twins reach them through the same auth and CSRF doors.
 */
describe("rest api", () => {
	let db: Database;
	let rest: ReturnType<typeof checkedApp>;

	beforeEach(async () => {
		db = await createTestDatabase();
		rest = checkedApp(db);
	});

	interface BrowserSession {
		cookie: string;
		csrfToken: string;
		refreshToken: string;
	}

	function browserSession(response: Response): BrowserSession {
		const pairs = response.headers.getSetCookie().map((cookie) => cookie.split(";")[0] ?? "");
		const value = (name: string) =>
			pairs.find((pair) => pair.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";

		expect(value(ACCESS_COOKIE)).not.toBe("");

		return {
			cookie: pairs.join("; "),
			csrfToken: value(CSRF_COOKIE),
			refreshToken: value(REFRESH_COOKIE),
		};
	}

	async function registerAlice(): Promise<BrowserSession> {
		const response = await rest.call("POST", "/api/v1/auth/register", {
			body: { email: "alice@example.com", name: "Alice", password: "password123" },
		});

		expect(response.status).toBe(201);

		return browserSession(response);
	}

	const asBrowser = (session: BrowserSession) => ({
		cookie: session.cookie,
		"x-csrf-token": session.csrfToken,
	});

	it("runs the session cycle on cookies alone", async () => {
		const session = await registerAlice();

		const me = await rest.call("GET", "/api/v1/auth/me", {
			headers: { cookie: session.cookie },
		});
		expect(me.status).toBe(200);
		expect(((await me.json()) as PublicUser).email).toBe("alice@example.com");

		const refreshed = await rest.call("POST", "/api/v1/auth/refresh", {
			headers: asBrowser(session),
		});
		expect(refreshed.status).toBe(200);
		expect(browserSession(refreshed).refreshToken).not.toBe(session.refreshToken);

		// The old refresh token was rotated out: a second use is a stolen token's use.
		const replayed = await rest.call("POST", "/api/v1/auth/refresh", {
			headers: { cookie: `${REFRESH_COOKIE}=${session.refreshToken}` },
		});
		expect(replayed.status).toBe(401);

		const out = await rest.call("POST", "/api/v1/auth/logout", { headers: asBrowser(session) });
		expect(out.status).toBe(200);
		expect(out.headers.getSetCookie().every((cookie) => /Max-Age=0/i.test(cookie))).toBe(true);
	});

	it("does not tell an unknown email from a wrong password", async () => {
		await registerAlice();

		const unknown = await rest.call("POST", "/api/v1/auth/login", {
			body: { email: "nobody@example.com", password: "password123" },
		});
		const wrong = await rest.call("POST", "/api/v1/auth/login", {
			body: { email: "alice@example.com", password: "not-it-at-all" },
		});

		expect(unknown.status).toBe(401);
		expect(wrong.status).toBe(401);
		expect(((await unknown.json()) as { error: { message: string } }).error.message).toBe(
			((await wrong.json()) as { error: { message: string } }).error.message,
		);
	});

	it("refuses a cookie-authenticated mutation without the CSRF header", async () => {
		const session = await registerAlice();

		const response = await rest.call("POST", "/api/v1/posts", {
			body: { title: "Riding the session", body: "x" },
			headers: { cookie: session.cookie },
		});

		expect(response.status).toBe(403);
		expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
			"FORBIDDEN",
		);
	});

	it("refuses the CSRF check before it reads the body", async () => {
		// tRPC's guard runs before its input parser; the REST one must too, or a forged
		// request could probe the body schema through 400s.
		const session = await registerAlice();

		const response = await rest.call("POST", "/api/v1/posts", {
			body: { nonsense: true },
			headers: { cookie: session.cookie },
		});

		expect(response.status).toBe(403);
	});

	it("exempts a bearer caller from CSRF", async () => {
		const user = await seedUser(db);

		const response = await rest.call("POST", "/api/v1/posts", {
			body: { title: "From a script", body: "x" },
			headers: { authorization: `Bearer ${await accessTokenFor(user)}` },
		});

		expect(response.status).toBe(201);
		expect(((await response.json()) as Post).authorId).toBe(user.id);
	});

	it("takes the author from the token, never from the body", async () => {
		const user = await seedUser(db);
		const other = await seedUser(db, { email: "other@example.com" });

		const response = await rest.call("POST", "/api/v1/posts", {
			body: { title: "Mine", body: "x", authorId: other.id },
			headers: { authorization: `Bearer ${await accessTokenFor(user)}` },
		});

		expect(((await response.json()) as Post).authorId).toBe(user.id);
	});

	it("keeps a draft invisible to everyone but its author", async () => {
		const author = await seedUser(db);
		const stranger = await seedUser(db, { email: "stranger@example.com" });
		const bearer = async (user: PublicUser) => ({
			authorization: `Bearer ${await accessTokenFor(user)}`,
		});

		const created = await rest.call("POST", "/api/v1/posts", {
			body: { title: "Draft", body: "x" },
			headers: await bearer(author),
		});
		const draft = (await created.json()) as Post;

		expect(draft.published).toBe(false);

		const anonymousList = (await (await rest.call("GET", "/api/v1/posts")).json()) as Post[];
		const authorList = (await (
			await rest.call("GET", "/api/v1/posts", { headers: await bearer(author) })
		).json()) as Post[];

		expect(anonymousList).toEqual([]);
		expect(authorList.map((post) => post.id)).toEqual([draft.id]);

		// 404, not 403: a 403 would confirm the draft exists.
		const byStranger = await rest.call("GET", `/api/v1/posts/${draft.id}`, {
			headers: await bearer(stranger),
		});
		expect(byStranger.status).toBe(404);
	});

	it("holds the list limit to 1..100, as a query string spells it", async () => {
		const status = async (query: string) =>
			(await rest.call("GET", `/api/v1/posts?${query}`)).status;

		expect(await status("limit=1")).toBe(200);
		expect(await status("limit=100")).toBe(200);
		expect(await status("limit=0")).toBe(400);
		expect(await status("limit=101")).toBe(400);
		expect(await status("limit=1.5")).toBe(400);
		expect(await status("limit=ten")).toBe(400);
		expect(await status("publishedOnly=true")).toBe(200);
		expect(await status("publishedOnly=yes")).toBe(400);
	});

	it("answers malformed JSON with a 400 and a request id", async () => {
		const response = await rest.handle(
			new Request("http://localhost/api/v1/auth/login", {
				method: "POST",
				headers: { "content-type": "application/json", "x-request-id": "from-the-gateway" },
				body: "{not json",
			}),
		);

		expect(response.status).toBe(400);
		expect(response.headers.get("x-request-id")).toBe("from-the-gateway");
		expect(await response.json()).toEqual({
			error: {
				code: "BAD_REQUEST",
				message: "Malformed request body",
				requestId: "from-the-gateway",
			},
		});
	});

	it("never leaks internals when a query blows up", async () => {
		const { db: missing } = createDatabase("postgres://nobody:hunter2@127.0.0.1:59999/nope");
		const broken = checkedApp(missing);

		const response = await broken.call("POST", "/api/v1/auth/login", {
			body: { email: "alice@example.com", password: "password123" },
		});

		expect(response.status).toBe(500);

		const raw = await response.text();

		expect(raw).not.toMatch(/select|insert into|password|hunter2|59999|\.ts:\d+/i);
		expect(JSON.parse(raw)).toEqual({
			error: {
				code: "INTERNAL",
				message: "Internal server error",
				requestId: expect.any(String),
			},
		});
	});
});
