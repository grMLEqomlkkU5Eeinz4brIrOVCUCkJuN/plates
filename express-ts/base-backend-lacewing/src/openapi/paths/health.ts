import { z } from "zod";
import { describeRoutes, named } from "../registry";

const healthSchema = named(
	"Health",
	z.strictObject({
		status: z.literal("ok"),
		timestamp: z.iso.datetime(),
	})
);

describeRoutes([
	{
		method: "get",
		path: "/health",
		operationId: "getHealth",
		summary: "Health check endpoint",
		description:
			"Liveness only: it answers while the process is up and checks no dependency.",
		tags: ["Health"],
		access: "open",
		responses: {
			200: { description: "Server is healthy", schema: healthSchema },
		},
	},
]);
