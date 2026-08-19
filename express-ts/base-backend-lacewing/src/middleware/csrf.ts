import { doubleCsrf } from "csrf-csrf";
import { CookieOptions, Request, Response } from "express";
import { env } from "../config/env";
import { ACCESS_COOKIE } from "./auth";

/**
 * Signed double-submit CSRF (csrf-csrf), bound to the session: the token is
 * HMAC'd with the access token as the session identifier, so a token minted
 * for one session is useless in another. Rotating the session (login,
 * refresh) therefore rotates the CSRF token too - both handlers return a
 * fresh one.
 *
 * The cookie is hardened to match lacewing's: HttpOnly, Secure, SameSite.
 */
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
	secure: true,
	sameSite: env.COOKIE_SAME_SITE,
	path: "/",
	domain: env.COOKIE_DOMAIN,
} as const satisfies CookieOptions;

const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
	getSecret: () => env.CSRF_SECRET,
	getSessionIdentifier: (req: Request) =>
		req.cookies?.[ACCESS_COOKIE] || req.ip || "anonymous",
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
