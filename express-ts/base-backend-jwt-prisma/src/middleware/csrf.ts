import { doubleCsrf } from "csrf-csrf";
import { CookieOptions, Request, Response } from "express";
import { env } from "../config/env";

const CSRF_COOKIE = "__csrf";

/**
 * Same scope as the session cookies in auth.ts: csrf-csrf validates the token
 * against the access-token cookie, so a CSRF cookie the browser will not send
 * back with the request it protects turns a legitimate request into a 403.
 * clearCsrfCookie reads the same object: a cookie is identified by name, domain
 * and path together, so a clear that differs anywhere expires nothing.
 */
const cookieOptions = {
	httpOnly: true,
	secure: env.COOKIE_SECURE,
	sameSite: env.COOKIE_SAME_SITE,
	path: "/",
	domain: env.COOKIE_DOMAIN,
} as const satisfies CookieOptions;

const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
	getSecret: () => env.CSRF_SECRET,
	// req.cookies, not the raw header: login and refresh seed req.cookies with
	// the access token minted on this response (controllers/auth.controller.ts),
	// because the session this response starts is the one the CSRF token has to
	// be bound to. Reading the header instead binds the token minted at login to
	// req.ip, and every authenticated mutation afterwards fails with a 403.
	//
	// A planted duplicate cookie cannot turn this into an accepted forgery: the
	// identifier would be the attacker's token while the victim's CSRF token is
	// bound to theirs, so validation fails closed. Protected routes never get
	// this far anyway, because authenticate runs first and refuses the ambiguous
	// cookie outright.
	getSessionIdentifier: (req: Request) =>
		req.cookies?.access_token || req.ip || "anonymous",
	cookieName: CSRF_COOKIE,
	cookieOptions,
	getCsrfTokenFromRequest: (req: Request) =>
		req.headers["x-csrf-token"] as string,
});

/**
 * Logout expires this alongside the session cookies. The stale token cannot
 * authorise anything on its own (it is HMAC'd against an access token that no
 * longer exists), but with COOKIE_DOMAIN set it would otherwise sit on every
 * subdomain under that parent until its own expiry.
 */
export const clearCsrfCookie = (res: Response): void => {
	res.clearCookie(CSRF_COOKIE, cookieOptions);
};

export { doubleCsrfProtection, generateCsrfToken as generateToken };
