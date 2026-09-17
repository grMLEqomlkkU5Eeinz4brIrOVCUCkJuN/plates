import { Request, Response } from "express";
import { pingDatabase } from "../db/prisma";
import logger from "../utils/logger";

/** Shorter than the pool's statement timeout: a probe that waits ten seconds
 *  has already failed as far as the orchestrator is concerned. */
const READINESS_BUDGET_MS = 2_000;

/**
 * Liveness: is this process still the process. It checks nothing else,
 * because the answer decides whether the container gets restarted, and
 * restarting the app does not fix a database that is down.
 */
export const getLiveness = (_req: Request, res: Response): void => {
	res.json({ status: "ok", timestamp: new Date().toISOString() });
};

/**
 * Readiness: should this instance receive traffic. It answers by doing what a
 * request does, which is talk to Postgres. A 200 that does not touch the
 * database would take a broken instance out of nobody's rotation.
 */
export const getReadiness = async (req: Request, res: Response): Promise<void> => {
	let timer: NodeJS.Timeout | undefined;

	try {
		await Promise.race([
			pingDatabase(),
			new Promise((_resolve, reject) => {
				timer = setTimeout(
					() => reject(new Error(`database did not answer within ${READINESS_BUDGET_MS}ms`)),
					READINESS_BUDGET_MS
				);
			}),
		]);

		res.json({ status: "ok", database: "up", timestamp: new Date().toISOString() });
	} catch (error) {
		logger.error("Readiness check failed", {
			requestId: req.requestId,
			error: error instanceof Error ? error.message : String(error),
		});

		res.status(503).json({
			success: false,
			code: "DEPENDENCY_UNAVAILABLE",
			status: "degraded",
			database: "down",
			requestId: req.requestId,
		});
	} finally {
		clearTimeout(timer);
	}
};
