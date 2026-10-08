import { parseBearer, readTokenCookie } from "lacewing";
import { verifyAccessToken } from "../auth/jwt";
import type { Actor } from "../auth/policy";
import { ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE } from "./cookies";

/**
 * Where the actor's token came from. It matters for exactly one thing: CSRF.
 * A cookie is attached by the browser automatically, so a cross-site page can
 * ride it - cookie-authenticated mutations therefore need the CSRF check. A
 * bearer header had to be set by code that could read the token, which is
 * proof enough by itself. "direct" is for tests that hand an actor straight
 * to the caller.
 */
export type ActorSource = "cookie" | "bearer" | "direct";

/**
 * Everything lacewing auth reads off an HTTP request. tRPC (trpc/context.ts) and the REST
 * routes (rest/index.ts) both start from this, so the two doors cannot disagree about who
 * is calling or whether a mutation carried its CSRF pair.
 */
export interface RequestAuth {
	actor: Actor | null;
	actorSource: ActorSource | null;
	/** Only refresh and logout look at this. */
	refreshToken: string | undefined;
	/** The two halves of the double-submit pair; see http/csrf.ts. */
	csrf: { cookie: string | undefined; header: string | undefined };
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

export async function resolveRequestAuth(req: Request): Promise<RequestAuth> {
	const { actor, source } = await resolveActor(req);

	return {
		actor,
		actorSource: source,
		// Both read with lacewing's readTokenCookie rather than a general
		// cookie parser, for the duplicate-name case. Nothing settles whether
		// the first or the last `csrf_token=` wins when a header carries two,
		// so a parser that picks one is guessing - and an attacker who can
		// write a cookie on this domain (a subdomain, a cookie-injection bug)
		// tosses in a second one whose value they know, then echoes it in the
		// header and walks through the double-submit check. readTokenCookie
		// refuses an ambiguous name outright, so the guess never happens: the
		// mutation is denied instead of maybe-accepted. The legitimate user is
		// denied too while the extra cookie is in place, which is the trade
		// worth making - an app that visibly stops beats one that silently
		// waves the attacker through.
		refreshToken: readTokenCookie(req, REFRESH_COOKIE),
		csrf: {
			cookie: readTokenCookie(req, CSRF_COOKIE),
			header: req.headers.get("x-csrf-token") ?? undefined,
		},
	};
}
