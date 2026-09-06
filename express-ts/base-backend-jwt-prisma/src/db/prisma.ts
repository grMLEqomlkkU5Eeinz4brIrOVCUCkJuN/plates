import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../config/env";
import { PrismaClient } from "../generated/prisma/client";

/**
 * Prisma 7 ships no query engine binary: the client talks to Postgres through a
 * driver adapter, so the pool below is node-postgres' own and its settings are
 * the ones that apply. `max` is per process, not per deployment - four replicas
 * of this service hold four pools, and Postgres counts the sum against
 * `max_connections`.
 */
const adapter = new PrismaPg({
	connectionString: env.DATABASE_URL,
	max: env.DATABASE_POOL_MAX,
});

/**
 * One client for the process. Each instance owns a pool, so a second one built
 * per request (or per module that forgot this file exists) exhausts the
 * database's connection limit long before it exhausts anything else.
 */
export const prisma = new PrismaClient({ adapter });

/**
 * main.ts calls this at boot so that a bad DATABASE_URL, an unreachable host or
 * a database nobody migrated is a process that fails to start, rather than a
 * healthy-looking service that 500s on the first request to touch a table.
 *
 * It is a query and not `$connect()` on purpose: with a driver adapter,
 * connecting is node-postgres' job and node-postgres opens a socket when a
 * query asks for one. `$connect()` returns happily against a host that is not
 * listening; `SELECT 1` does not.
 */
export const connectDatabase = async (): Promise<void> => {
	await prisma.$queryRaw`SELECT 1`;
};

/** Closes the pool. Without it, shutdown waits on sockets nobody is using. */
export const disconnectDatabase = async (): Promise<void> => {
	await prisma.$disconnect();
};
