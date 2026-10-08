import { z } from "zod";
import type { ErrorCode } from "../../models/error.model";
import { describeRoutes, named } from "../registry";

// controllers/health.controller.ts sends the timestamp already serialised.
const timestamp = z.iso.datetime();

const liveness = named(
	"Liveness",
	z.strictObject({ status: z.literal("ok"), timestamp })
);

const readiness = named(
	"Readiness",
	z.strictObject({ status: z.literal("ok"), database: z.literal("up"), timestamp })
);

// Not the shared error body: a probe reader wants `database`, and there is no
// message to show anyone.
const degraded = named(
	"Degraded",
	z.strictObject({
		success: z.literal(false),
		code: z.literal("DEPENDENCY_UNAVAILABLE" satisfies ErrorCode),
		status: z.literal("degraded"),
		database: z.literal("down"),
		requestId: z.string(),
	})
);

describeRoutes([
	{
		method: "get",
		path: "/health",
		operationId: "getLiveness",
		summary: "Liveness probe. Answers whether the process should be restarted.",
		tags: ["Health"],
		access: "open",
		responses: {
			200: { description: "The process is running.", schema: liveness },
		},
	},
	{
		method: "get",
		path: "/health/ready",
		operationId: "getReadiness",
		summary: "Readiness probe. Answers whether this instance should get traffic.",
		tags: ["Health"],
		access: "open",
		responses: {
			200: { description: "The database answered.", schema: readiness },
			503: { description: "DEPENDENCY_UNAVAILABLE.", schema: degraded },
		},
	},
]);
