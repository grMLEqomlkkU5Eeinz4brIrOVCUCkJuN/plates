import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { verifyAccessToken } from "../auth/jwt";
import type { Actor } from "../auth/policy";
import type { Database } from "../db";
import { ACCESS_COOKIE, REFRESH_COOKIE, readCookies } from "../http/cookies";
import type { Logger } from "../lib/logger";
import type { ServiceCtx } from "../services/context";

/**
 * The tRPC context extends ServiceCtx rather than redeclaring its fields, so a resolver
 * can hand `ctx` straight to a service: `listPosts(ctx, input)`. The service's parameter
 * type is ServiceCtx, so everything added below - the raw Request, the response headers,
 * the refresh token - is invisible to it. The transport can see the transport; the
 * service cannot.
 */
export interface Context extends ServiceCtx {
	req: Request;
	resHeaders: Headers;
	/** Only auth.refresh and auth.logout look at this. */
	refreshToken: string | undefined;
	/** Shared with the access log and returned to the client on an error. */
	requestId: string;
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
