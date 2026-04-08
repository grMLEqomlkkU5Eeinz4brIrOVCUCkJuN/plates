import { doubleCsrf } from "csrf-csrf";
import { Request } from "express";
import { env } from "../config/env";

const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
	getSecret: () => env.CSRF_SECRET,
	getSessionIdentifier: (req: Request) => req.cookies?.access_token || req.ip || "anonymous",
	cookieName: "__csrf",
	cookieOptions: {
		httpOnly: true,
		secure: env.COOKIE_SECURE,
		sameSite: env.COOKIE_SAME_SITE,
		path: "/",
	},
	getCsrfTokenFromRequest: (req: Request) => req.headers["x-csrf-token"] as string,
});

export { doubleCsrfProtection, generateCsrfToken as generateToken };
