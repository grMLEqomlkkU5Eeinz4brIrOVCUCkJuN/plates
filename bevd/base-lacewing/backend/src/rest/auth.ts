import { clearedCookies, cookiesForSession } from "../http/cookies";
import { LoginInput, RegisterInput } from "../models/auth";
import { login, logout, me, refresh, register } from "../services/auth.service";
import { type RestBase, requireSignedIn } from "./base";

/**
 * The session cycle, mirroring trpc/routers/auth.ts: tokens go out in httpOnly cookies and
 * only the user comes back in the body. A REST caller that cannot hold cookies has no way
 * to obtain a bearer token here - that is what gRPC's AuthService is for.
 */
export function authRoutes(app: RestBase) {
	return app
		.post(
			"/auth/register",
			async ({ service, body, set }) => {
				const session = await register(service, body);

				set.headers["set-cookie"] = cookiesForSession(session);
				set.status = 201;

				return session.user;
			},
			{ body: RegisterInput },
		)
		.post(
			"/auth/login",
			async ({ service, body, set }) => {
				const session = await login(service, body);

				set.headers["set-cookie"] = cookiesForSession(session);

				return session.user;
			},
			{ body: LoginInput },
		)
		.post("/auth/refresh", async ({ service, auth, set }) => {
			const session = await refresh(service, auth.refreshToken);

			set.headers["set-cookie"] = cookiesForSession(session);

			return session.user;
		})
		.post("/auth/logout", async ({ service, auth, set }) => {
			const result = await logout(service, auth.refreshToken);

			set.headers["set-cookie"] = clearedCookies();

			return result;
		})
		.get("/auth/me", ({ service }) => me(service), { transform: requireSignedIn });
}
