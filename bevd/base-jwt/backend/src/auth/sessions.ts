import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../db";
import { refreshTokens } from "../db/schema";

/**
 * Session storage, one level below the services.
 *
 * These take a `Database`, not a `ServiceCtx`, and that difference is the point: a
 * ServiceCtx carries an actor, and every service entry point starts by checking it.
 * Nothing here checks anything. Revoking someone else's sessions is a privileged act, and
 * the caller is the one that has to have established the privilege - user.service.ts does
 * so with requireAdmin before it demotes anyone.
 *
 * Taking `db` keeps that honest: this cannot be mistaken for a transport-callable entry
 * point, because it does not have the shape of one.
 */
export function revokeAllSessions(db: Database, userId: string): Promise<unknown> {
	return db
		.update(refreshTokens)
		.set({ revokedAt: new Date() })
		.where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

/** Revokes the one token. Logging out of this browser does not sign you out everywhere. */
export function revokeSession(db: Database, tokenHash: string): Promise<unknown> {
	return db
		.update(refreshTokens)
		.set({ revokedAt: new Date() })
		.where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));
}
