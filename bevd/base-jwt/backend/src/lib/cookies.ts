import { parseCookie, stringifySetCookie } from "cookie";
import { env } from "../config/env";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

/**
 * httpOnly is the whole point: JavaScript in the page cannot read these, so an XSS bug
 * cannot walk off with the session. It is also why the Vue app is never handed a token
 * to keep in localStorage - it holds nothing worth stealing.
 *
 * (cookie v2 renamed `serialize`/`parse` to `stringifySetCookie`/`parseCookie`, and the
 * name is now a field on the object rather than a first argument.)
 */
const attributes = {
	httpOnly: true,
	secure: env.COOKIE_SECURE,
	sameSite: env.COOKIE_SAME_SITE,
	path: "/",
} as const;

export function readCookies(req: Request): Record<string, string | undefined> {
	const header = req.headers.get("cookie");

	return header ? parseCookie(header) : {};
}

export function sessionCookies(accessToken: string, refreshToken: string): string[] {
	return [
		stringifySetCookie({
			...attributes,
			name: ACCESS_COOKIE,
			value: accessToken,
			maxAge: 15 * 60,
		}),
		stringifySetCookie({
			...attributes,
			name: REFRESH_COOKIE,
			value: refreshToken,
			maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
		}),
	];
}

/** Max-Age=0 tells the browser to drop them now, rather than trusting it to forget. */
export function clearedCookies(): string[] {
	return [
		stringifySetCookie({ ...attributes, name: ACCESS_COOKIE, value: "", maxAge: 0 }),
		stringifySetCookie({ ...attributes, name: REFRESH_COOKIE, value: "", maxAge: 0 }),
	];
}
