import { Elysia } from "elysia";
import type { AppDeps } from "../app";
import type { PublicUser } from "../db/schema";
import { REFRESH_COOKIE, readCookies, sessionCookies } from "../http/cookies";
import { LoginInput } from "../models/auth";
import { login, me, refresh, type Session } from "../services/auth.service";
import { restContext, signedIn } from "./context";
import { restErrors } from "./errors";

/**
 * The REST twin of trpc/routers/auth.ts, for the three calls a client needs to hold a
 * session: log in, refresh, ask who it is. register and logout stay RPC-only (see the
 * README for why).
 *
 * Same cookies, same body: the tokens go into httpOnly cookies and only the user comes
 * back, for the reasons given on commitSession there.
 */
function commitSession(headers: Record<string, unknown>, session: Session): PublicUser {
	headers["set-cookie"] = sessionCookies(session.accessToken, session.refreshToken);

	return session.user;
}

export function authRoutes(deps: AppDeps) {
	return new Elysia({ prefix: "/api/v1" })
		.use(restErrors(deps.log))
		.use(restContext(deps))
		.post(
			"/auth/login",
			async ({ ctx, body, set }) => commitSession(set.headers, await login(ctx, body)),
			{ body: LoginInput },
		)
		.post("/auth/refresh", async ({ ctx, request, set }) =>
			commitSession(set.headers, await refresh(ctx, readCookies(request)[REFRESH_COOKIE])),
		)
		.get("/auth/me", ({ ctx }) => me(ctx), { transform: signedIn });
}
