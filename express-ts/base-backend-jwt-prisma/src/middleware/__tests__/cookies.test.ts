import cookieParser from "cookie-parser";
import { describe, expect, it, jest } from "@jest/globals";
import express, { type Express } from "express";
import request from "supertest";
import { authenticate } from "../auth";
import { signAccessToken } from "../../services/token.service";

/**
 * COOKIE_DOMAIN has to reach every cookie the auth flow sets, and the clear has
 * to name the same one. Scope the session cookies to a parent and leave the
 * CSRF cookie host-only and the two stop travelling together: csrf.ts HMACs
 * each token against the access-token cookie, so a request whose session cookie
 * did not arrive fails the check and gets a 403. Miss the domain
 * on the way out instead and logout expires a cookie the browser does not have.
 *
 * config/env.ts reads the environment once, at import, so each case builds its
 * app in an isolated module registry.
 */
interface AuthCookies {
	set: string[];
	cleared: string[];
	csrf: string[];
}

const cookiesWith = async (domain?: string): Promise<AuthCookies> => {
	const previous = process.env.COOKIE_DOMAIN;
	if (domain === undefined) delete process.env.COOKIE_DOMAIN;
	else process.env.COOKIE_DOMAIN = domain;

	try {
		let app!: Express;

		// require, not import: ts-jest compiles this suite to CommonJS, where a
		// dynamic import() needs Node's ESM VM flag. Nothing else in the
		// templates does this - a test that has to re-read the environment is
		// the one place that needs a second copy of a module.
		jest.isolateModules((): void => {
			/* eslint-disable @typescript-eslint/no-require-imports */
			const { setAuthCookies, clearAuthCookies } =
				require("../auth") as typeof import("../auth");
			const { clearCsrfCookie, generateToken } =
				require("../csrf") as typeof import("../csrf");
			/* eslint-enable @typescript-eslint/no-require-imports */

			app = express();
			// csrf-csrf reads the existing cookie through req.cookies, the way
			// app.ts arranges for it.
			app.use(cookieParser());
			app.get("/set", (_req, res) => {
				setAuthCookies(
					res,
					"access-token-value",
					"refresh-token-value"
				);
				res.end();
			});
			app.get("/clear", (_req, res) => {
				clearAuthCookies(res);
				clearCsrfCookie(res);
				res.end();
			});
			app.get("/csrf", (req, res) => {
				generateToken(req, res);
				res.end();
			});
		});

		const sent = async (path: string): Promise<string[]> =>
			(await request(app).get(path)).get("Set-Cookie") ?? [];

		return {
			set: await sent("/set"),
			cleared: await sent("/clear"),
			csrf: await sent("/csrf"),
		};
	} finally {
		if (previous === undefined) delete process.env.COOKIE_DOMAIN;
		else process.env.COOKIE_DOMAIN = previous;
	}
};

describe("auth cookie scope", () => {
	it("leaves every cookie host-only when COOKIE_DOMAIN is unset", async () => {
		const { set, cleared, csrf } = await cookiesWith(undefined);

		expect(set).toHaveLength(2);
		expect(cleared).toHaveLength(3);
		expect(csrf).toHaveLength(1);
		for (const cookie of [...set, ...cleared, ...csrf]) {
			expect(cookie).not.toContain("Domain=");
		}
	});

	it("scopes the session and CSRF cookies to COOKIE_DOMAIN together", async () => {
		const { set, cleared, csrf } = await cookiesWith("example.com");

		expect(set).toHaveLength(2);
		expect(cleared).toHaveLength(3);
		expect(csrf).toHaveLength(1);
		for (const cookie of [...set, ...cleared, ...csrf]) {
			expect(cookie).toContain("Domain=example.com");
		}
	});

	it("expires the CSRF cookie with the session, not after it", async () => {
		const { cleared } = await cookiesWith("example.com");

		// A stale __csrf cookie cannot authorise anything once the access token
		// it is HMAC'd against is gone, but with a Domain set it would sit on
		// every subdomain under that parent until its own expiry.
		const csrf = cleared.filter((cookie) => cookie.startsWith("__csrf="));
		expect(csrf).toHaveLength(1);
		expect(csrf[0]).toContain("Domain=example.com");
	});

	it("treats a leading dot as the same domain, per RFC 6265", async () => {
		const { set } = await cookiesWith(".example.com");

		for (const cookie of set) {
			expect(cookie).toContain("Domain=example.com");
		}
	});
});

describe("a second cookie of the same name", () => {
	// An attacker who can write on a domain the browser considers ours (a
	// sibling subdomain, once COOKIE_DOMAIN widens the scope) can plant a
	// second access_token. Browsers send both, oldest first, and cookie-parser
	// takes the first, so picking one is picking theirs half the time.
	it("is refused rather than resolved in the attacker's favour", async () => {
		const app = express();
		app.use(cookieParser());
		app.get("/whoami", authenticate, (req, res) => {
			res.json({ userId: req.auth?.userId });
		});

		const mine = signAccessToken({ sub: "victim", sid: "session-1" });
		const planted = signAccessToken({ sub: "attacker", sid: "session-2" });

		const alone = await request(app)
			.get("/whoami")
			.set("Cookie", `access_token=${mine}`);
		expect(alone.status).toBe(200);
		expect(alone.body.userId).toBe("victim");

		const shadowed = await request(app)
			.get("/whoami")
			.set("Cookie", `access_token=${planted}; access_token=${mine}`);
		expect(shadowed.status).toBe(401);
	});
});
