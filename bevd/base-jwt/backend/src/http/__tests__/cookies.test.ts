import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * COOKIE_DOMAIN has to reach every cookie a session is made of, and the logout
 * has to name the same domain the login used. Miss it on the way in and a
 * frontend on app.example.com never receives the cookies api.example.com set,
 * so a login that returned 200 is followed by requests with no session on them.
 * Miss it on the way out and logout expires a cookie the browser does not have.
 *
 * config/env.ts reads the environment once, at import, so each case re-imports
 * the module under a different one.
 */
async function cookiesWith(domain: string): Promise<{
	set: string[];
	cleared: string[];
}> {
	vi.resetModules();
	vi.stubEnv("COOKIE_DOMAIN", domain);

	const { sessionCookies, clearedCookies } = await import("../cookies");

	return {
		set: sessionCookies("accesstoken", "refreshtoken"),
		cleared: clearedCookies(),
	};
}

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

describe("cookie scope", () => {
	it("leaves every cookie host-only when COOKIE_DOMAIN is unset", async () => {
		const { set, cleared } = await cookiesWith("");

		expect(set).toHaveLength(2);
		expect(cleared).toHaveLength(2);
		for (const cookie of [...set, ...cleared]) {
			expect(cookie).not.toContain("Domain=");
		}
	});

	it("scopes the session cookies to COOKIE_DOMAIN, set and cleared alike", async () => {
		const { set, cleared } = await cookiesWith("example.com");

		expect(set).toHaveLength(2);
		expect(cleared).toHaveLength(2);
		for (const cookie of [...set, ...cleared]) {
			expect(cookie).toContain("Domain=example.com");
		}
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
	// second access_token. Browsers send both and `cookie` returns the first,
	// so picking one is picking theirs half the time.
	it("is dropped rather than resolved in the attacker's favour", async () => {
		const { readCookies, ACCESS_COOKIE } = await import("../cookies");

		const alone = readCookies(
			new Request("http://localhost", {
				headers: { cookie: `${ACCESS_COOKIE}=mine` },
			}),
		);
		expect(alone[ACCESS_COOKIE]).toBe("mine");

		const shadowed = readCookies(
			new Request("http://localhost", {
				headers: { cookie: `${ACCESS_COOKIE}=planted; ${ACCESS_COOKIE}=mine` },
			}),
		);
		expect(shadowed[ACCESS_COOKIE]).toBeUndefined();
	});
});
