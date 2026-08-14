import type { UntypedServiceImplementation } from "@grpc/grpc-js";
import { login, logout, me, refresh, register } from "../../services/auth.service";
import { type GrpcDeps, unary } from "../unary";
import { toWireSession, toWireUser } from "../wire";

/**
 * The gRPC face of the auth service.
 *
 * The one real difference from trpc/routers/auth.ts: there are no cookies here. The HTTP
 * router puts the tokens in httpOnly cookies and returns only the user; gRPC has no cookie
 * jar, so the session goes back on the wire and the caller stores it. Same service, same
 * rotation, different delivery - which is exactly the seam `Session` exists to allow.
 */
export function authHandlers(deps: GrpcDeps): UntypedServiceImplementation {
	return {
		Register: unary(deps, "Register", async (ctx, request: unknown) =>
			toWireSession(await register(ctx, request)),
		),

		Login: unary(deps, "Login", async (ctx, request: unknown) =>
			toWireSession(await login(ctx, request)),
		),

		Refresh: unary(deps, "Refresh", async (ctx, request: { refresh_token?: string }) =>
			toWireSession(await refresh(ctx, request.refresh_token)),
		),

		Logout: unary(deps, "Logout", (ctx, request: { refresh_token?: string }) =>
			logout(ctx, request.refresh_token),
		),

		Me: unary(deps, "Me", async (ctx, _request: unknown) => toWireUser(await me(ctx))),
	};
}
