import { type } from "arktype";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../auth/actor";
import { revokeAllSessions } from "../auth/sessions";
import { type PublicUser, toPublicUser, users } from "../db/schema";
import { AppError, parseInput } from "../lib/errors";
import type { ServiceCtx } from "./context";

export const SetRoleInput = type({
	userId: "string.uuid",
	role: "'user' | 'admin'",
});

export const UserIdInput = type({ userId: "string.uuid" });

/**
 * Admin-only, all of it.
 *
 * The check lives in the service, not only in the `adminProcedure` wrapper, because two
 * transports reach this code. A guard bolted onto the tRPC router alone would leave the
 * gRPC door open. Transports reject early for a clean error; the service is what makes
 * the rule true.
 *
 * Every mutation here is also logged with the admin who did it. Privilege changes are
 * exactly the events you will want a record of after the fact.
 */
export async function listUsers(ctx: ServiceCtx): Promise<PublicUser[]> {
	requireAdmin(ctx.actor);

	const rows = await ctx.db.query.users.findMany({ orderBy: users.createdAt });

	return rows.map(toPublicUser);
}

export async function setUserRole(ctx: ServiceCtx, input: unknown): Promise<PublicUser> {
	const admin = requireAdmin(ctx.actor);
	const { userId, role } = parseInput(SetRoleInput, input);

	// Without this, the last admin can demote themselves and nobody can ever promote
	// anyone again - the system locks itself out with no way back in through the app.
	if (userId === admin.id && role !== "admin") {
		throw new AppError("BAD_REQUEST", "You cannot remove your own admin role");
	}

	const [updated] = await ctx.db
		.update(users)
		.set({ role, updatedAt: new Date() })
		.where(eq(users.id, userId))
		.returning();

	if (!updated) {
		throw new AppError("NOT_FOUND", `No user with id ${userId}`);
	}

	// The old access token still says "user" (or "admin") until it expires. Dropping the
	// refresh tokens means it cannot be renewed, so a demotion actually takes hold within
	// one access-token lifetime instead of lingering for a week.
	//
	// revokeAllSessions checks nothing on its own - see auth/sessions.ts. The requireAdmin
	// above is what authorizes this, and it has to come first.
	await revokeAllSessions(ctx.db, userId);

	ctx.log.warn({ event: "user.role_changed", actorId: admin.id, userId, role }, "role changed");

	return toPublicUser(updated);
}

export async function deleteUser(ctx: ServiceCtx, input: unknown): Promise<{ id: string }> {
	const admin = requireAdmin(ctx.actor);
	const { userId } = parseInput(UserIdInput, input);

	if (userId === admin.id) {
		throw new AppError("BAD_REQUEST", "You cannot delete your own account");
	}

	const [deleted] = await ctx.db.delete(users).where(eq(users.id, userId)).returning();

	if (!deleted) {
		throw new AppError("NOT_FOUND", `No user with id ${userId}`);
	}

	ctx.log.warn({ event: "user.deleted", actorId: admin.id, userId }, "user deleted");

	// Posts and refresh tokens go with them - see the cascade in db/schema.ts.
	return { id: deleted.id };
}
