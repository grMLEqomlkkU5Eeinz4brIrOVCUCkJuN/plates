import { describeRoutes } from "../registry";
import { HealthSchema } from "../schemas";

describeRoutes([
	{
		method: "get",
		path: "/health",
		operationId: "getHealth",
		summary: "Liveness: the process is up and serving HTTP.",
		description:
			"Does not touch the database. tRPC's health.db is the call that proves Postgres is reachable.",
		tags: ["Health"],
		access: "open",
		responses: {
			200: {
				description: "Up, with seconds since the process started.",
				schema: HealthSchema,
			},
		},
	},
]);
