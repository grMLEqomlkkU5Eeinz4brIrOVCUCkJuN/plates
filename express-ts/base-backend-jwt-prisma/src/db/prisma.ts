import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../config/env";
import { Prisma, PrismaClient } from "../generated/prisma/client";

/**
 * Prisma 7 ships no query engine binary: the client talks to Postgres through a
 * driver adapter, so the pool below is node-postgres' own and its settings are
 * the ones that apply. Every one of them guards a distinct failure mode; the
 * comments say which.
 */
const adapter = new PrismaPg({
	connectionString: env.DATABASE_URL,

	// Ceiling on concurrent connections FROM THIS PROCESS. Four replicas at the
	// default of 10 hold forty, and Postgres counts all of them against its
	// global max_connections.
	max: env.DATABASE_POOL_MAX,

	// Hand a connection back rather than holding it open forever while idle.
	// Managed Postgres and NAT gateways both drop idle TCP sessions without
	// telling either end.
	idleTimeoutMillis: env.DATABASE_POOL_IDLE_TIMEOUT_MS,

	// Fail a query that cannot GET a connection, instead of hanging on it.
	// Without this a pool exhausted by one slow query turns into an app that
	// accepts requests and never answers any of them, which looks like a hang
	// rather than an error.
	connectionTimeoutMillis: env.DATABASE_CONNECT_TIMEOUT_MS,

	// Postgres cancels the statement itself at this point, which is the only
	// version of a query timeout that also frees the server-side work. The
	// client-side query_timeout releases the pool slot even when the
	// cancellation is what got lost.
	statement_timeout: env.DATABASE_STATEMENT_TIMEOUT_MS,
	query_timeout: env.DATABASE_STATEMENT_TIMEOUT_MS,

	// A transaction left open holds its locks and its snapshot. Nothing here
	// legitimately sits idle mid-transaction for longer than a single
	// statement is allowed to run.
	idle_in_transaction_session_timeout: env.DATABASE_STATEMENT_TIMEOUT_MS,
});

/**
 * One client for the process, and the only import of it outside src/db is from
 * src/services. Controllers and middleware go through a service; that rule is
 * what keeps a query from growing inside a request handler, and it is what
 * makes the services the one place to look when a query is wrong.
 *
 * Each PrismaClient owns a pool, so a second one built per request (or per
 * module that forgot this file exists) exhausts the database's connection
 * limit long before it exhausts anything else.
 */
export const prisma = new PrismaClient({ adapter });

/**
 * One round trip. main.ts calls this at boot so that a bad DATABASE_URL, an
 * unreachable host or a database nobody migrated is a process that fails to
 * start, rather than a healthy-looking service that 500s on the first request
 * to touch a table; the readiness probe calls it on every check.
 *
 * It is a query rather than `$connect()` because, with a driver adapter,
 * connecting is node-postgres' job and node-postgres opens a socket when a
 * query asks for one. `$connect()` returns happily against a host that is not
 * listening; `SELECT 1` does not.
 */
export const pingDatabase = async (): Promise<void> => {
	await prisma.$queryRaw`SELECT 1`;
};

/**
 * Closes the pool. Called from the shutdown handler in main.ts and from the
 * test setup. An unclosed pool holds its Postgres connections until the server
 * times them out on its own schedule, so a rolling restart transiently needs
 * twice the connection budget; it also keeps the event loop alive, so the
 * process waits out the shutdown timeout instead of exiting on its own.
 */
export const disconnectDatabase = async (): Promise<void> => {
	await prisma.$disconnect();
};

/**
 * The two driver failures a service turns into a status code. Everything else
 * Prisma raises stays a 500, which is the right answer for a connection
 * failure or a schema that does not match the database.
 *
 * Catching the unique violation beats checking first: "is this email taken?"
 * followed by an insert is two statements with a gap in the middle, and two
 * concurrent signups both pass the check. The index is the only thing that can
 * answer atomically, so let it answer, and translate what it throws.
 */
const prismaCode = (error: unknown): string | undefined =>
	error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;

export const isUniqueViolation = (error: unknown): boolean => prismaCode(error) === "P2002";

/** update/delete on a row that is not there. */
export const isRecordNotFound = (error: unknown): boolean => prismaCode(error) === "P2025";
