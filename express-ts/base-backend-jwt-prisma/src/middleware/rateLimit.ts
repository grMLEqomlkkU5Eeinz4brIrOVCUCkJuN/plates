import { Request, Response, NextFunction, RequestHandler } from "express";
import { env } from "../config/env";
import { httpError } from "./errorHandler";
import logger from "../utils/logger";

/**
 * In-memory fixed-window limiter for the credential endpoints.
 *
 * CAVEAT, stated plainly: this counter lives in the process. Run two replicas,
 * or let the orchestrator restart one, and the limit resets. It raises the
 * cost of guessing a password from trivial to annoying; it is not a substitute
 * for a shared store. Move it to Redis (rate-limiter-flexible takes one) before
 * treating it as a real control.
 *
 * Kept in-process anyway because the alternative right now is nothing, and
 * login is the endpoint an attacker makes progress against by repeating it.
 */
interface Window {
	firstRequestTime: number;
	count: number;
}

const store = new Map<string, Window>();

const isLimited = (key: string): boolean => {
	const now = Date.now();
	const entry = store.get(key);

	if (!entry || now - entry.firstRequestTime > env.RATE_LIMIT_WINDOW_MS) {
		store.set(key, { firstRequestTime: now, count: 1 });
		return false;
	}

	entry.count += 1;
	return entry.count > env.RATE_LIMIT_MAX;
};

// Sweeps expired windows so the map cannot grow without bound; pruning only
// as a side effect of a request arriving leaves a burst of traffic followed by
// silence resident forever. unref() so the timer never holds the process open
// during shutdown.
const sweep = setInterval(() => {
	const now = Date.now();
	for (const [key, entry] of store) {
		if (now - entry.firstRequestTime > env.RATE_LIMIT_WINDOW_MS) {
			store.delete(key);
		}
	}
}, env.RATE_LIMIT_WINDOW_MS).unref();

export const stopRateLimitSweep = (): void => clearInterval(sweep);

/** Empties the windows. The suite calls this between tests so that one test's
 *  requests do not spend another test's budget; nothing else should. */
export const resetRateLimits = (): void => store.clear();

/**
 * Limits by the account when the caller has one, otherwise by client IP, and
 * in both cases by the email being targeted when the body names one. Every
 * counter is always evaluated: with `a() || b()` the per-email counter would
 * stop incrementing the moment the IP limit tripped.
 *
 * req.ip honours the `trust proxy` setting. Reading X-Forwarded-For by hand
 * would let any client forge the header and hand itself a fresh bucket per
 * request.
 */
export const rateLimit = (scope: string): RequestHandler => {
	return (req: Request, res: Response, next: NextFunction): void => {
		const body = req.body as { email?: unknown } | undefined;
		const email = typeof body?.email === "string" ? body.email : null;

		const keys = [req.auth ? `${scope}:user:${req.auth.userId}` : `${scope}:ip:${req.ip}`];
		if (email) keys.push(`${scope}:email:${email.toLowerCase()}`);

		const limited = keys.map(isLimited).some(Boolean);

		if (limited) {
			logger.warn("Rate limit exceeded", {
				scope,
				ip: req.ip,
				userId: req.auth?.userId,
				requestId: req.requestId,
			});

			const retryAfterSeconds = Math.ceil(env.RATE_LIMIT_WINDOW_MS / 1000);
			res.setHeader("Retry-After", retryAfterSeconds);

			throw httpError(
				429,
				`Too many attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
				{ errorCode: "RATE_LIMITED" }
			);
		}

		next();
	};
};
