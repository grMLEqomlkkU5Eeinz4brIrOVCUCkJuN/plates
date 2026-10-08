import { verifyAccessToken } from "../auth/jwt";
import type { Actor } from "../auth/policy";
import { ACCESS_COOKIE, readCookies } from "./cookies";

/**
 * Who sent this HTTP request. Lives with the other HTTP session code rather than in
 * trpc/context.ts so that any HTTP route can resolve a caller the same way. gRPC has its
 * own equivalent in grpc/metadata.ts, because it has no Request to read.
 *
 * Reads the access token from the httpOnly cookie, falling back to a bearer header.
 *
 * The cookie is what the browser uses. The header is for everything else - curl, another
 * service, a mobile app - which has no cookie jar to keep one in.
 *
 * A bad or expired token is not an error here, it just means "anonymous". Turning that
 * into a 401 is the procedure's job, and only for procedures that require a user.
 */
export async function resolveActor(req: Request): Promise<Actor | null> {
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
