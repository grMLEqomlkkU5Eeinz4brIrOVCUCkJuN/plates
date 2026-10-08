import { z } from "zod";
import { describeRoutes, named } from "../registry";

// Written from getHealth's output; the controller has no schema of its own.
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
		tags: ["Health"],
		access: "open",
		responses: {
			200: { description: "Server is healthy", schema: healthSchema },
		},
	},
]);
