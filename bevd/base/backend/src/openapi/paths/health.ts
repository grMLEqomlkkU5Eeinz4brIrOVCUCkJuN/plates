import { type } from "arktype";
import { describeRoutes, named } from "../registry";

const Health = named("Health", type({ "+": "reject", status: "'ok'", uptime: "number" }));

describeRoutes([
	{
		method: "get",
		path: "/health",
		operationId: "getHealth",
		summary: "Liveness: the process is up and serving HTTP.",
		description:
			"Checks nothing beyond the process itself; it answers without a database. " +
			"Readiness (can it reach Postgres) is the tRPC procedure health.db.",
		tags: ["Health"],
		responses: {
			200: { description: "The process is up, and for how many seconds.", schema: Health },
		},
	},
]);
