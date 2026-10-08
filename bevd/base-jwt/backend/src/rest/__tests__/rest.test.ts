import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../../db";
import type { PublicUser } from "../../db/schema";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "../../http/cookies";
import { AppError } from "../../lib/errors";
import { createPost } from "../../services/post.service";
import { testApp } from "../../test/app";
import { accessTokenFor, actorFor, seedUser } from "../../test/auth";
import { callerAs, serviceCtx } from "../../test/context";
import { createTestDatabase } from "../../test/db";
import type { ErrorBody } from "../error-body";

describe("rest api", () => {
	let db: Database;
	let app: ReturnType<typeof testApp>;
	let alice: PublicUser;
	let bob: PublicUser;

	beforeEach(async () => {
		db = await createTestDatabase();
		app = testApp(db);
		alice = await seedUser(db, { email: "alice@example.com", name: "Alice" });
		bob = await seedUser(db, { email: "bob@example.com", name: "Bob" });
	});

	function call(
		method: string,
		path: string,
		{ body, headers = {} }: { body?: unknown; headers?: Record<string, string> } = {},
	): Promise<Response> {
		return app.handle(
			new Request(`http://localhost/api/v1${path}`, {
				method,
				headers:
					body === undefined
						? headers
						: { "content-type": "application/json", ...headers },
				body: body === undefined ? undefined : JSON.stringify(body),
			}),
		);
	}

	function cookieFrom(response: Response, name: string): string {
		const header = response.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));

		return header?.split(";")[0] ?? "";
	}

	async function bearer(user: PublicUser): Promise<Record<string, string>> {
		return { authorization: `Bearer ${await accessTokenFor(user)}` };
	}

	async function errorOf(response: Response): Promise<(typeof ErrorBody.infer)["error"]> {
		return ((await response.json()) as typeof ErrorBody.infer).error;
	}

	it("logs in with cookies and returns only the user", async () => {
		const response = await call("POST", "/auth/login", {
			body: { email: "ALICE@example.com", password: "password123" },
		});

		expect(response.status).toBe(200);

		const user = (await response.json()) as Record<string, unknown>;
		expect(user.id).toBe(alice.id);
		expect(user).not.toHaveProperty("passwordHash");
		expect(JSON.stringify(user)).not.toMatch(/eyJ/);

		const me = await call("GET", "/auth/me", {
			headers: { cookie: cookieFrom(response, ACCESS_COOKIE) },
		});
		await expect(me.json()).resolves.toMatchObject({ email: "alice@example.com" });
	});

	it("gives a wrong password the same answer as an unknown email", async () => {
		const wrong = await call("POST", "/auth/login", {
			body: { email: "alice@example.com", password: "nope-nope" },
		});
		const unknown = await call("POST", "/auth/login", {
			body: { email: "nobody@example.com", password: "nope-nope" },
		});

		expect([wrong.status, unknown.status]).toEqual([401, 401]);
		expect(await errorOf(wrong)).toMatchObject({
			code: "UNAUTHORIZED",
			message: "Invalid email or password",
		});
		expect((await errorOf(unknown)).message).toBe("Invalid email or password");
	});

	it("rotates the refresh token, so a replayed one is refused", async () => {
		const login = await call("POST", "/auth/login", {
			body: { email: "alice@example.com", password: "password123" },
		});
		const first = cookieFrom(login, REFRESH_COOKIE);

		const refreshed = await call("POST", "/auth/refresh", { headers: { cookie: first } });
		expect(refreshed.status).toBe(200);
		expect(cookieFrom(refreshed, REFRESH_COOKIE)).not.toBe(first);

		const replayed = await call("POST", "/auth/refresh", { headers: { cookie: first } });
		expect(replayed.status).toBe(401);
		expect((await errorOf(replayed)).message).toBe("Invalid or expired refresh token");
	});

	it("refuses /auth/me without a session, and takes a bearer header instead of a cookie", async () => {
		const anonymous = await call("GET", "/auth/me");
		expect(anonymous.status).toBe(401);
		expect(await errorOf(anonymous)).toMatchObject({
			code: "UNAUTHORIZED",
			message: "You must be signed in",
		});

		const withHeader = await call("GET", "/auth/me", { headers: await bearer(bob) });
		await expect(withHeader.json()).resolves.toMatchObject({ id: bob.id });
	});

	it("shows drafts to their author only, through the same service as post.list", async () => {
		await callerAs(db, actorFor(alice)).post.create({ title: "Alice draft", body: "x" });
		await callerAs(db, actorFor(bob)).post.create({
			title: "Bob published",
			body: "y",
			published: true,
		});

		const titles = async (headers?: Record<string, string>) =>
			((await (await call("GET", "/posts", { headers })).json()) as { title: string }[])
				.map((post) => post.title)
				.sort();

		expect(await titles()).toEqual(["Bob published"]);
		expect(await titles(await bearer(bob))).toEqual(["Bob published"]);
		expect(await titles(await bearer(alice))).toEqual(["Alice draft", "Bob published"]);
	});

	it("reads limit and publishedOnly from the query string, with post.list's bounds", async () => {
		for (const title of ["one", "two", "three"]) {
			await callerAs(db, actorFor(alice)).post.create({ title, body: "x", published: true });
		}
		await callerAs(db, actorFor(alice)).post.create({ title: "draft", body: "x" });

		const two = await call("GET", "/posts?limit=2", { headers: await bearer(alice) });
		expect((await two.json()) as unknown[]).toHaveLength(2);

		const published = await call("GET", "/posts?publishedOnly=true", {
			headers: await bearer(alice),
		});
		expect((await published.json()) as unknown[]).toHaveLength(3);

		const tooMany = await call("GET", "/posts?limit=101");
		expect(tooMany.status).toBe(400);
		expect(await errorOf(tooMany)).toMatchObject({
			code: "BAD_REQUEST",
			message: "limit must be at most 100 (was 101)",
		});

		const zero = await call("GET", "/posts?limit=0");
		expect(zero.status).toBe(400);

		const notANumber = await call("GET", "/posts?limit=ten");
		expect(notANumber.status).toBe(400);
	});

	it("reports someone else's draft as 404, and a malformed id as 400", async () => {
		const draft = await callerAs(db, actorFor(alice)).post.create({
			title: "Secret",
			body: "x",
		});

		const asBob = await call("GET", `/posts/${draft.id}`, { headers: await bearer(bob) });
		expect(asBob.status).toBe(404);

		const asAlice = await call("GET", `/posts/${draft.id}`, { headers: await bearer(alice) });
		await expect(asAlice.json()).resolves.toMatchObject({ id: draft.id });

		const malformed = await call("GET", "/posts/not-a-uuid");
		expect(malformed.status).toBe(400);
	});

	it("creates a post as the caller, whatever author the body names", async () => {
		const response = await call("POST", "/posts", {
			body: { title: "Hello", body: "there", authorId: bob.id },
			headers: await bearer(alice),
		});

		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toMatchObject({
			title: "Hello",
			authorId: alice.id,
			published: false,
		});
	});

	it("tells an anonymous caller to sign in before it judges the body", async () => {
		const response = await call("POST", "/posts", { body: { title: "" } });

		expect(response.status).toBe(401);
		expect((await errorOf(response)).code).toBe("UNAUTHORIZED");
	});

	it("rejects invalid input with the message the service itself sends", async () => {
		const input = { title: "", body: 3 };

		const rest = await call("POST", "/posts", { body: input, headers: await bearer(alice) });
		expect(rest.status).toBe(400);

		// What gRPC sends: parseInput's text, from the same CreatePostInput.
		const fromService = await createPost(serviceCtx(db, actorFor(alice)), input).catch(
			(error: unknown) => error,
		);

		expect(fromService).toBeInstanceOf(AppError);
		expect(await errorOf(rest)).toMatchObject({
			code: "BAD_REQUEST",
			message: (fromService as AppError).message,
		});
		expect((fromService as AppError).message).toBe(
			"body must be a string (was a number)\ntitle must be non-empty",
		);
	});

	it("answers a malformed body with 400 and a request id the caller can quote", async () => {
		const response = await app.handle(
			new Request("http://localhost/api/v1/auth/login", {
				method: "POST",
				headers: { "content-type": "application/json", "x-request-id": "from-the-gateway" },
				body: "{not json",
			}),
		);

		expect(response.status).toBe(400);
		expect(await errorOf(response)).toEqual({
			code: "BAD_REQUEST",
			message: "Malformed request body",
			requestId: "from-the-gateway",
		});
		expect(response.headers.get("x-request-id")).toBe("from-the-gateway");
	});

	it("never leaks internals when a query blows up", async () => {
		const { db: missing } = createDatabase("postgres://nobody:hunter2@127.0.0.1:59999/nope");
		const broken = testApp(missing);

		const response = await broken.handle(
			new Request("http://localhost/api/v1/posts", {
				headers: { "x-request-id": "trace-me" },
			}),
		);

		expect(response.status).toBe(500);

		const raw = await response.text();
		expect(JSON.parse(raw)).toEqual({
			error: { code: "INTERNAL", message: "Internal server error", requestId: "trace-me" },
		});
		expect(raw).not.toMatch(/select|hunter2|59999|\.ts:\d+/i);
	});
});
