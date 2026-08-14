import type { PublicUser } from "../../db/schema";
import { clearedCookies, sessionCookies } from "../../http/cookies";
import { generateCsrfToken } from "../../http/csrf";
import {
	LoginInput,
	login,
	logout,
	me,
	RegisterInput,
	refresh,
	register,
	type Session,
} from "../../services/auth.service";
import type { Context } from "../context";
import { protectedProcedure, publicProcedure, router } from "../trpc";

/**
 * Puts the session in httpOnly cookies and returns only the user.
 *
 * This is the one router that does real work, and all of it is transport: the service
 * hands back a `Session` and knows nothing about how it travels. Over gRPC the same
 * session goes back on the wire instead (see grpc/handlers/auth.ts).
 *
 * The tokens deliberately do not appear in the response body: if the browser cannot read
 * them, neither can injected script. The Vue app never holds a token - it just gets 401s
 * when the cookie is gone, which is all it needs to know.
 */
function commitSession(ctx: Context, session: Session): PublicUser {
	// A fresh CSRF token with every session: it rides in the one readable
	// cookie, and mutations must echo it in the x-csrf-token header. See
	// http/csrf.ts and the csrfGuard in ../trpc.ts.
	const csrfToken = generateCsrfToken();

	for (const cookie of sessionCookies(session.accessToken, session.refreshToken, csrfToken)) {
		ctx.resHeaders.append("set-cookie", cookie);
	}

	return session.user;
}

export const authRouter = router({
	/** trpc.auth.register.mutate({ email, name, password }) */
	register: publicProcedure
		.input(RegisterInput)
		.mutation(async ({ ctx, input }) => commitSession(ctx, await register(ctx, input))),

	/** trpc.auth.login.mutate({ email, password }) */
	login: publicProcedure
		.input(LoginInput)
		.mutation(async ({ ctx, input }) => commitSession(ctx, await login(ctx, input))),

	/**
	 * trpc.auth.refresh.mutate()
	 *
	 * Takes no input: the refresh token comes from the cookie, so a page in another tab
	 * cannot pass one in. Rotates the token - see auth.service.ts.
	 */
	refresh: publicProcedure.mutation(async ({ ctx }) =>
		commitSession(ctx, await refresh(ctx, ctx.refreshToken)),
	),

	/** trpc.auth.logout.mutate() - revokes the refresh token and clears both cookies. */
	logout: publicProcedure.mutation(async ({ ctx }) => {
		await logout(ctx, ctx.refreshToken);

		for (const cookie of clearedCookies()) {
			ctx.resHeaders.append("set-cookie", cookie);
		}

		return { ok: true as const };
	}),

	/** trpc.auth.me.query() - 401 when signed out, which is how the client knows. */
	me: protectedProcedure.query(({ ctx }) => me(ctx)),
});
