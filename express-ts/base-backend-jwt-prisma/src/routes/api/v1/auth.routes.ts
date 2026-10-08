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

router.get("/csrf-token", getCsrfToken);

router.post("/register", rateLimit("register"), validate({ body: registerSchema }), register);

router.post("/login", rateLimit("login"), validate({ body: loginSchema }), login);

// The refresh cookie rides along on any cross-site POST to this path, so it
// needs the CSRF header like every other cookie-authenticated mutation. With
// the access cookie still present, the token from login or the last refresh
// passes; once it has expired the browser has dropped it, the session
// identifier falls back to req.ip, and a token from GET /csrf-token passes.
router.post("/refresh", doubleCsrfProtection, rateLimit("refresh"), refresh);

// Everything below this line requires a valid access cookie. Adding a public
// route means adding it above the line, where it is visible.
router.use(authenticate);

router.post("/logout", doubleCsrfProtection, logout);

export default router;
