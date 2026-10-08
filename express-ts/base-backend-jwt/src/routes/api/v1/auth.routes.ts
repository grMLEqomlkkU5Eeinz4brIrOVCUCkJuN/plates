import { Router } from "express";
import { validate } from "../../../middleware/validate";
import { authenticate } from "../../../middleware/auth";
import { doubleCsrfProtection } from "../../../middleware/csrf";
import {
	login,
	logout,
	refresh,
	getCsrfToken,
	me,
} from "../../../controllers/auth.controller";
import { loginSchema } from "../../../models/auth.model";

const router = Router();

router.get("/csrf-token", getCsrfToken);

router.post("/login", validate({ body: loginSchema }), login);

router.post("/logout", authenticate, doubleCsrfProtection, logout);

router.post("/refresh", doubleCsrfProtection, refresh);

router.get("/me", authenticate, me);

export default router;
