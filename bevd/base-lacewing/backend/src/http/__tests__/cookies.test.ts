import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * COOKIE_DOMAIN has to reach every cookie a session is made of, the
 * script-readable CSRF one included, and the logout has to name the same domain
 * the login used. Miss the CSRF cookie and the double-submit check fails for a
 * reason no error mentions: script on the app host cannot read a cookie the API
 * host scoped to itself, so the header it echoes back is never sent. Miss it on
 * the way out and logout expires a cookie the browser does not have.
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
		set: sessionCookies("accesstoken", "refreshtoken", "csrftoken"),
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

		expect(set).toHaveLength(3);
		expect(cleared).toHaveLength(3);
		for (const cookie of [...set, ...cleared]) {
			expect(cookie).not.toContain("Domain=");
		}
	});

	it("scopes the token and CSRF cookies to COOKIE_DOMAIN together", async () => {
		const { set, cleared } = await cookiesWith("example.com");

		expect(set).toHaveLength(3);
		expect(cleared).toHaveLength(3);
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
