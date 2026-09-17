import { Router } from "express";
import { validate } from "../../../middleware/validate";
import { authenticate } from "../../../middleware/auth";
import { doubleCsrfProtection } from "../../../middleware/csrf";
import { rateLimit } from "../../../middleware/rateLimit";
import { loginSchema, registerSchema } from "../../../models/auth.model";
import {
	getCsrfToken,
	login,
	logout,
	refresh,
	register,
} from "../../../controllers/auth.controller";

const router = Router();

/**
 * Every credential endpoint here is rate limited, login included: login is the
 * endpoint an attacker makes progress against by repeating it, and limiting
 * only password reset (the usual habit) is backwards. The limiter is
 * in-process; see the caveat at the top of middleware/rateLimit.ts.
 */

/**
 * @swagger
 * /auth/csrf-token:
 *   get:
 *     summary: A CSRF token for the session in hand, or for an anonymous caller.
 *     description: >
 *       Login and register return one alongside the cookies, so this is only
 *       needed after a page reload. Send it back as the x-csrf-token header on
 *       every mutation.
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Token issued.
 */
router.get("/csrf-token", getCsrfToken);

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Create an account and open a session.
 *     tags: [Auth]
 *     responses:
 *       201:
 *         description: Account created; session cookies set; csrfToken in the body.
 *       400:
 *         description: VALIDATION_ERROR.
 *       409:
 *         description: EMAIL_TAKEN.
 *       429:
 *         description: RATE_LIMITED.
 */
router.post("/register", rateLimit("register"), validate({ body: registerSchema }), register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Exchange email and password for session cookies.
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Session opened; csrfToken in the body.
 *       401:
 *         description: INVALID_CREDENTIALS.
 *       429:
 *         description: RATE_LIMITED.
 */
router.post("/login", rateLimit("login"), validate({ body: loginSchema }), login);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Rotate the refresh cookie for a new pair.
 *     description: >
 *       Refresh tokens are single use. Presenting one twice revokes the whole
 *       family and answers REFRESH_REUSED; either way the cookies are cleared
 *       on failure.
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: New cookies set; csrfToken in the body.
 *       401:
 *         description: REFRESH_INVALID or REFRESH_REUSED.
 */
router.post("/refresh", rateLimit("refresh"), refresh);

// Everything below this line requires a valid access cookie. Adding a public
// route means adding it above the line, where it is visible.
router.use(authenticate);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Revoke this session and expire its cookies.
 *     description: >
 *       The access token itself stays valid until it expires, which is at most
 *       JWT_ACCESS_EXPIRY away; the refresh chain is dead immediately.
 *     tags: [Auth]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: header, name: x-csrf-token, required: true, schema: { type: string } }
 *     responses:
 *       204:
 *         description: Session revoked.
 *       403:
 *         description: CSRF_INVALID.
 */
router.post("/logout", doubleCsrfProtection, logout);

export default router;
