import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { Database } from "../db";
import type { Actor } from "../lib/actor";
import { ACCESS_COOKIE, REFRESH_COOKIE, readCookies } from "../lib/cookies";
import { verifyAccessToken } from "../lib/jwt";
import type { Logger } from "../lib/logger";

export interface Context {
	db: Database;
	req: Request;
	resHeaders: Headers;
	/** Null for an anonymous caller. Procedures decide whether that is allowed. */
	actor: Actor | null;
	/** Only auth.refresh and auth.logout look at this. */
	refreshToken: string | undefined;
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
 * The cookie is what the browser uses. The header is for everything else - curl, another
 * service, a mobile app - which has no cookie jar to keep one in.
 *
 * A bad or expired token is not an error here, it just means "anonymous". Turning that
 * into a 401 is the procedure's job, and only for procedures that require a user.
 */
async function resolveActor(req: Request): Promise<Actor | null> {
	const cookies = readCookies(req);
	const header = req.headers.get("authorization");

	const token = cookies[ACCESS_COOKIE] ?? header?.match(/^Bearer (.+)$/i)?.[1];

	if (!token) return null;

	try {
		const payload = await verifyAccessToken(token);

		return { id: payload.sub, email: payload.email, role: payload.role };
	} catch {
		return null;
	}
}

export function createContextFactory({ db, requestId, log }: ContextDeps) {
	return async ({ req, resHeaders }: FetchCreateContextFnOptions): Promise<Context> => {
		const actor = await resolveActor(req);

		return {
			db,
			req,
			resHeaders,
			actor,
			refreshToken: readCookies(req)[REFRESH_COOKIE],
			requestId,
			// Every line this request produces now carries who made it. Note that it is the
			// user *id*, not the email: logs get shipped, indexed and kept, and there is no
			// reason to spread personal data through them.
			log: actor ? log.child({ userId: actor.id, role: actor.role }) : log,
		};
	};
}
