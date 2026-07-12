import { env } from "../config/env";
import { logger } from "../lib/logger";
import { createDatabase } from "./index";
import { posts } from "./schema";

const { db, pool } = createDatabase(env.DATABASE_URL);

const inserted = await db
	.insert(posts)
	.values([
		{
			title: "Hello Elysia",
			body: "Bun is the runtime, Elysia is the server.",
			published: true,
		},
		{
			title: "Typed end to end",
			body: "tRPC carries the router types into Vue.",
			published: true,
		},
		{ title: "Draft", body: "Not published yet.", published: false },
	])
	.returning();

logger.info({ count: inserted.length }, "seeded posts");

await pool.end();
