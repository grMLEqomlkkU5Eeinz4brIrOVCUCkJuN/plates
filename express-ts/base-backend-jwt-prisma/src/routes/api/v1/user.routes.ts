import { Router } from "express";
import { validate } from "../../../middleware/validate";
import { authenticate } from "../../../middleware/auth";
import { doubleCsrfProtection } from "../../../middleware/csrf";
import { rateLimit } from "../../../middleware/rateLimit";
import {
	deleteAccountSchema,
	listUsersQuery,
	updateAccountSchema,
	userIdParams,
} from "../../../models/user.model";
import {
	closeAccount,
	getAccount,
	getUser,
	listUsers,
	patchAccount,
} from "../../../controllers/user.controller";

const router = Router();

/**
 * One `router.use(authenticate)` at the top rather than per route, so that a
 * route added without it is impossible rather than a thing to remember. The
 * account routes act on the caller's own row, taken from the token; there is
 * no PATCH or DELETE /users/:id, because an ownership check that is written
 * down anywhere can be forgotten somewhere.
 */
router.use(authenticate);

router.get("/me", getAccount);

router.patch("/me", doubleCsrfProtection, validate({ body: updateAccountSchema }), patchAccount);

router.delete(
	"/me",
	doubleCsrfProtection,
	rateLimit("account-close"),
	validate({ body: deleteAccountSchema }),
	closeAccount
);

router.get("/", validate({ query: listUsersQuery }), listUsers);

router.get("/:id", validate({ params: userIdParams }), getUser);

export default router;
