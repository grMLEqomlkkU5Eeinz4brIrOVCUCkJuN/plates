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
	loginSchema,
} from "../../../controllers/auth.controller";

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *         password:
 *           type: string
 *           minLength: 1
 *     AuthResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         message:
 *           type: string
 *         user:
 *           type: object
 *           properties:
 *             userId:
 *               type: string
 *             email:
 *               type: string
 *         csrfToken:
 *           type: string
 *     CsrfTokenResponse:
 *       type: object
 *       properties:
 *         csrfToken:
 *           type: string
 */

/**
 * @swagger
 * /auth/csrf-token:
 *   get:
 *     summary: Get CSRF token
 *     description: Returns a CSRF token for use in subsequent state-changing requests
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: CSRF token generated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CsrfTokenResponse'
 */
router.get("/csrf-token", getCsrfToken);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login user
 *     description: Authenticates user and sets JWT cookies
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error
 */
router.post(
	"/login",
	validate({ body: loginSchema }),
	login
);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout user
 *     description: Clears JWT cookies
 *     tags: [Auth]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: header
 *         name: x-csrf-token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post(
	"/logout",
	authenticate,
	doubleCsrfProtection,
	logout
);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh tokens
 *     description: Uses refresh token to generate new access and refresh tokens
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Tokens refreshed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post("/refresh", refresh);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current user
 *     description: Returns the authenticated user's information
 *     tags: [Auth]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: User information
 *       401:
 *         description: Not authenticated
 */
router.get("/me", authenticate, me);

export default router;
