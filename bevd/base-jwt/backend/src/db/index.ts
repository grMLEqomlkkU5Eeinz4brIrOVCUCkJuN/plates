import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

/**
 * Nothing connects at import time - `pg` only opens a socket on the first query.
 * The app builds its database in `src/index.ts` and passes it down, which is what
 * lets the tests swap in PGlite without touching a real server.
 */
export function createDatabase(connectionString: string): { db: Database; pool: Pool } {
	const pool = new Pool({ connectionString });
	const db = drizzle(pool, { schema });

	return { db, pool };
}

/**
 * One round trip, for the readiness probe. Lives here rather than in the router
 * that calls it because the routers are transport: they translate a request into
 * a service call and a result into a response, and a query written into one is
 * the first of many. The services own the queries that mean something; this is
 * the one that means nothing except "the pool can reach Postgres".
 */
export async function pingDatabase(db: Database): Promise<void> {
	await db.execute(sql`select 1`);
}

export { schema };
