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

router.post("/refresh", rateLimit("refresh"), refresh);

// Everything below this line requires a valid access cookie. Adding a public
// route means adding it above the line, where it is visible.
router.use(authenticate);

router.post("/logout", doubleCsrfProtection, logout);

export default router;
