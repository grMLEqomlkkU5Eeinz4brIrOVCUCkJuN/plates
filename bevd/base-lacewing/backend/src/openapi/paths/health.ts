import { describeRoutes } from "../registry";
import { HealthView } from "../schemas";

describeRoutes([
	{
		method: "get",
		path: "/health",
		operationId: "getHealth",
		summary: "Liveness: the process is up. Touches no dependency.",
		description:
			"Readiness - whether Postgres answers - is the tRPC procedure health.db, which has no REST twin.",
		tags: ["Health"],
		access: "open",
		responses: {
			200: { description: "The process is serving.", schema: HealthView },
		},
	},
]);
