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

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: The signed-in account.
 *     tags: [Users]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: The account.
 *       401:
 *         description: UNAUTHENTICATED, TOKEN_EXPIRED or TOKEN_INVALID.
 */
router.get("/me", getAccount);

/**
 * @swagger
 * /users/me:
 *   patch:
 *     summary: Change name or email.
 *     description: Unknown fields are a 400 rather than a silent drop.
 *     tags: [Users]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: header, name: x-csrf-token, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: The updated account.
 *       400:
 *         description: VALIDATION_ERROR.
 *       409:
 *         description: EMAIL_TAKEN.
 */
router.patch("/me", doubleCsrfProtection, validate({ body: updateAccountSchema }), patchAccount);

/**
 * @swagger
 * /users/me:
 *   delete:
 *     summary: Close the account. Final.
 *     description: >
 *       Takes the current password: a borrowed session is not enough authority
 *       to delete an account. The row and its sessions go; the cookies are
 *       expired on the response.
 *     tags: [Users]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: header, name: x-csrf-token, required: true, schema: { type: string } }
 *     responses:
 *       204:
 *         description: Account closed.
 *       401:
 *         description: INVALID_CREDENTIALS.
 */
router.delete(
	"/me",
	doubleCsrfProtection,
	rateLimit("account-close"),
	validate({ body: deleteAccountSchema }),
	closeAccount
);

/**
 * @swagger
 * /users:
 *   get:
 *     summary: A page of users, oldest first.
 *     description: >
 *       Cursor pagination. `cursor` is the id of the last user in the previous
 *       page; a page shorter than `limit` is the end. `limit` is capped at 100
 *       on the server.
 *     tags: [Users]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *       - { in: query, name: cursor, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: The page.
 */
router.get("/", validate({ query: listUsersQuery }), listUsers);

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: One user's public profile.
 *     tags: [Users]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: The user.
 *       400:
 *         description: VALIDATION_ERROR, when the id is not a uuid.
 *       404:
 *         description: NOT_FOUND.
 */
router.get("/:id", validate({ params: userIdParams }), getUser);

export default router;
