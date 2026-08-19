import { parseCookie, stringifySetCookie } from "cookie";
import { accessTokenTtlSeconds } from "../auth/tokens";
import { env } from "../config/env";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

/**
 * How a session travels over HTTP - and nothing else in the app knows.
 *
 * This lives under http/ rather than lib/ on purpose: it is transport, not policy. No
 * service imports it, and none can, because a service is handed a ServiceCtx that has no
 * Request and no Headers on it. Over gRPC the same session goes back as fields on the
 * wire (see grpc/handlers/auth.ts) with none of this involved.
 *
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
	// Host-only when COOKIE_DOMAIN is unset; config/env.ts says when to set it.
	// Set and cleared through this one object because a cookie is identified by
	// name, domain and path together: a logout that omits the domain expires a
	// cookie the browser does not have and leaves the real one in place.
	domain: env.COOKIE_DOMAIN,
} as const;

/**
 * Nothing settles whether the first or the last `access_token=` wins when a
 * header carries two, so a parser that picks one is guessing. An attacker who
 * can write a cookie on this domain (a sibling subdomain, a cookie-injection
 * bug) tosses in a second one whose value they know and hopes the guess goes
 * their way. Names that arrive twice are dropped instead: the request is
 * treated as anonymous rather than maybe-authenticated. It denies the
 * legitimate user too while the extra cookie is in place, which is the trade
 * worth making, and it is the same call lacewing makes in the sibling template.
 *
 * COOKIE_DOMAIN makes this reachable by design, because a cookie scoped to a
 * parent is one every subdomain under it can also write.
 */
export function readCookies(req: Request): Record<string, string | undefined> {
	const header = req.headers.get("cookie");

	if (!header) return {};

	const cookies = parseCookie(header);

	for (const name of duplicatedNames(header)) {
		cookies[name] = undefined;
	}

	return cookies;
}

function duplicatedNames(header: string): string[] {
	const seen = new Set<string>();
	const twice = new Set<string>();

	for (const pair of header.split(";")) {
		const eq = pair.indexOf("=");

		if (eq === -1) continue;

		const name = pair.slice(0, eq).trim();

		if (seen.has(name)) twice.add(name);

		seen.add(name);
	}

	return [...twice];
}

export function sessionCookies(accessToken: string, refreshToken: string): string[] {
	return [
		stringifySetCookie({
			...attributes,
			name: ACCESS_COOKIE,
			value: accessToken,
			maxAge: accessTokenTtlSeconds(),
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
