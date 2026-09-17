import { Router } from "express";
import { getLiveness, getReadiness } from "../../../controllers/health.controller";

const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Liveness probe. Answers whether the process should be restarted.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: The process is running.
 */
router.get("/", getLiveness);

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: Readiness probe. Answers whether this instance should get traffic.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: The database answered.
 *       503:
 *         description: DEPENDENCY_UNAVAILABLE.
 */
router.get("/ready", getReadiness);

export default router;
