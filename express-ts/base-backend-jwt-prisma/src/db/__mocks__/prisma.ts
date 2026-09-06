import { Prisma } from "../../generated/prisma/client";
import type { PrismaClient } from "../../generated/prisma/client";
import type { UserData } from "../../models/user.model";

/**
 * Manual mock for src/db/prisma, picked up by `jest.mock("<path>/db/prisma")`.
 *
 * The suite that ships with this template exercises routing, auth, CSRF and
 * validation - the things Express is responsible for - and it does that without
 * a Postgres to point at, exactly as the in-memory version of this template
 * did. What it does not do is prove a query is correct: `findUnique` here is a
 * Map lookup, not SQL. Once the schema grows past `User`, run the real thing:
 * point DATABASE_URL at a throwaway database (docker-compose.yml has one, or
 * Testcontainers can start one per run), `prisma migrate deploy` into it, and
 * drop the `jest.mock` line from the suites that should hit it.
 *
 * The failures it does reproduce faithfully are the two that decide a status
 * code: P2002 for a duplicate unique value and P2025 for a row that is not
 * there. middleware/errorHandler.ts maps both, so the 409 and 404 paths are
 * covered by the same error type the driver would raise.
 */
const users = new Map<string, UserData>();

const knownError = (code: string, message: string, meta?: Record<string, unknown>): never => {
	throw new Prisma.PrismaClientKnownRequestError(message, {
		code,
		clientVersion: "test",
		meta,
	});
};

const requireUser = (id: string): UserData =>
	users.get(id) ??
	knownError("P2025", "An operation failed because it depends on one or more records that were required but not found.");

const requireUniqueEmail = (email: string, exceptId?: string): void => {
	for (const user of users.values()) {
		if (user.email === email && user.id !== exceptId) {
			knownError("P2002", "Unique constraint failed on the fields: (`email`)", {
				target: ["email"],
			});
		}
	}
};

const user = {
	create: ({ data }: { data: { email: string; name: string } }): UserData => {
		requireUniqueEmail(data.email);

		const now = new Date();
		const created: UserData = {
			id: crypto.randomUUID(),
			...data,
			createdAt: now,
			updatedAt: now,
		};
		users.set(created.id, created);

		return created;
	},

	findMany: (): UserData[] =>
		[...users.values()].sort(
			(a, b) => a.createdAt.getTime() - b.createdAt.getTime()
		),

	findUnique: ({ where }: { where: { id: string } }): UserData | null =>
		users.get(where.id) ?? null,

	update: ({
		where,
		data,
	}: {
		where: { id: string };
		data: { email?: string; name?: string };
	}): UserData => {
		const existing = requireUser(where.id);
		if (data.email) requireUniqueEmail(data.email, existing.id);

		const updated: UserData = { ...existing, ...data, updatedAt: new Date() };
		users.set(updated.id, updated);

		return updated;
	},

	delete: ({ where }: { where: { id: string } }): UserData => {
		const existing = requireUser(where.id);
		users.delete(existing.id);

		return existing;
	},
};

// The delegates above are synchronous and the real ones are not; awaiting a
// plain value is what makes that invisible to the controllers.
export const prisma = { user } as unknown as PrismaClient;

export const connectDatabase = async (): Promise<void> => {};

export const disconnectDatabase = async (): Promise<void> => {};

/** Empties the store, for a suite that wants to start from nothing. */
export const resetDatabase = (): void => {
	users.clear();
};
