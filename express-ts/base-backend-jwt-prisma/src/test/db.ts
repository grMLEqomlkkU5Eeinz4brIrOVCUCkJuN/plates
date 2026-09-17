import { prisma } from "../db/prisma";

/**
 * Empties everything the suite writes. TRUNCATE rather than deleteMany because
 * the cascade does the work: users is the root of refresh_tokens, and listing
 * every child table here would go stale the first time one is added.
 *
 * This is the one query outside src/services, and it exists because a test
 * fixture is not a request: nothing a service exposes should be able to empty
 * the table.
 */
export const resetDatabase = async (): Promise<void> => {
	await prisma.$executeRawUnsafe("TRUNCATE TABLE users RESTART IDENTITY CASCADE");
};
