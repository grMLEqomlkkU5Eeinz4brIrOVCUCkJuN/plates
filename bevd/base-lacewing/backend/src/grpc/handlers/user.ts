import type { UntypedServiceImplementation } from "@grpc/grpc-js";
import { deleteUser, listUsers, setUserRole } from "../../services/user.service";
import { type GrpcDeps, unary } from "../unary";
import { toWireUser } from "../wire";

/**
 * Admin only - and nothing here says so.
 *
 * That is the point worth pausing on. The tRPC side has `adminProcedure` to reject early
 * with a clean error, but the rule itself is `requireAdmin` inside user.service.ts. This
 * door has no middleware of its own and needs none: the same call, the same check, no
 * second copy to get wrong.
 */
export function userHandlers(deps: GrpcDeps): UntypedServiceImplementation {
	return {
		ListUsers: unary(deps, "ListUsers", async (ctx, _request: unknown) => ({
			users: (await listUsers(ctx)).map(toWireUser),
		})),

		SetUserRole: unary(
			deps,
			"SetUserRole",
			async (ctx, request: { user_id: string; role: string }) =>
				toWireUser(await setUserRole(ctx, { userId: request.user_id, role: request.role })),
		),

		DeleteUser: unary(deps, "DeleteUser", (ctx, request: { user_id: string }) =>
			deleteUser(ctx, { userId: request.user_id }),
		),
	};
}
