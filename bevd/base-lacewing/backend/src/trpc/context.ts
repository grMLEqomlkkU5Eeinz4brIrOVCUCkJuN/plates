import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { parseBearer, readTokenCookie } from "lacewing";
import type { Database } from "../db";
import type { Actor } from "../lib/actor";
import { ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE, readCookies } from "../lib/cookies";
import { verifyAccessToken } from "../lib/jwt";
import type { Logger } from "../lib/logger";

/**
 * Where the actor's token came from. It matters for exactly one thing: CSRF.
 * A cookie is attached by the browser automatically, so a cross-site page can
 * ride it - cookie-authenticated mutations therefore need the CSRF check. A
 * bearer header had to be set by code that could read the token, which is
 * proof enough by itself. "direct" is for tests that hand an actor straight
 * to the caller.
 */
export type ActorSource = "cookie" | "bearer" | "direct";

export interface Context {
	db: Database;
	req: Request;
	resHeaders: Headers;
	/** Null for an anonymous caller. Procedures decide whether that is allowed. */
	actor: Actor | null;
	actorSource: ActorSource | null;
	/** Only auth.refresh and auth.logout look at this. */
	refreshToken: string | undefined;
	/** The two halves of the double-submit pair; trpc.ts compares them. */
	csrf: { cookie: string | undefined; header: string | undefined };
	/** Shared with the access log and returned to the client on an error. */
	requestId: string;
	/** Already bound to the requestId and, once known, the user. Use this, not the root. */
	log: Logger;
}

export interface ContextDeps {
	db: Database;
	requestId: string;
	log: Logger;
}

/**
 * Reads the access token from the httpOnly cookie, falling back to a bearer header.
 *
 * The cookie is what the browser uses - read with lacewing's readTokenCookie,
 * which also rejects malformed values. The header is for everything else -
 * curl, another service, a mobile app - and goes through parseBearer: strict
 * RFC 6750, exactly one `Bearer <token>`, no query-string tokens, no
 * whitespace tricks.
 *
 * A bad or expired token is not an error here, it just means "anonymous". Turning that
 * into a 401 is the procedure's job, and only for procedures that require a user.
 */
async function resolveActor(
	req: Request,
): Promise<{ actor: Actor | null; source: ActorSource | null }> {
	let token = readTokenCookie(req, ACCESS_COOKIE);
	let source: ActorSource = "cookie";

	if (!token && req.headers.get("authorization") !== null) {
		try {
			token = parseBearer(req);
			source = "bearer";
		} catch {
			// A malformed Authorization header is anonymous, same as a bad token.
			return { actor: null, source: null };
		}
	}

	if (!token) return { actor: null, source: null };

	try {
		const payload = await verifyAccessToken(token);

		return {
			actor: { id: payload.sub, email: payload.email, role: payload.role },
			source,
		};
	} catch {
		return { actor: null, source: null };
	}
}

export function createContextFactory({ db, requestId, log }: ContextDeps) {
	return async ({ req, resHeaders }: FetchCreateContextFnOptions): Promise<Context> => {
		const { actor, source } = await resolveActor(req);
		const cookies = readCookies(req);

		return {
			db,
			req,
			resHeaders,
			actor,
			actorSource: source,
			refreshToken: cookies[REFRESH_COOKIE],
			csrf: {
				cookie: cookies[CSRF_COOKIE],
				header: req.headers.get("x-csrf-token") ?? undefined,
			},
			requestId,
			// Every line this request produces now carries who made it. Note that it is the
			// user *id*, not the email: logs get shipped, indexed and kept, and there is no
			// reason to spread personal data through them.
			log: actor ? log.child({ userId: actor.id, role: actor.role }) : log,
		};
	};
}
