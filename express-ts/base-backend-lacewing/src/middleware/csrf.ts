import { doubleCsrf } from "csrf-csrf";
import { Request } from "express";
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
const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
	getSecret: () => env.CSRF_SECRET,
	getSessionIdentifier: (req: Request) =>
		req.cookies?.[ACCESS_COOKIE] || req.ip || "anonymous",
	cookieName: "__csrf",
	cookieOptions: {
		httpOnly: true,
		secure: true,
		sameSite: env.COOKIE_SAME_SITE,
		path: "/",
	},
	getCsrfTokenFromRequest: (req: Request) =>
		req.headers["x-csrf-token"] as string,
});

export { doubleCsrfProtection, generateCsrfToken as generateToken };
