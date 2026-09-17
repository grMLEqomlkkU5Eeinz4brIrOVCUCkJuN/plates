import swaggerJsdoc from "swagger-jsdoc";
import { env } from "./env";

const options: swaggerJsdoc.Options = {
	definition: {
		openapi: "3.0.0",
		info: {
			title: env.SERVICE_NAME,
			version: "1.0.0",
			description:
				"Errors are one shape everywhere: { success: false, code, message, requestId }. `code` is the value to branch on; the list is ErrorCode in src/middleware/errorHandler.ts.",
		},
		servers: [{ url: "/api/v1", description: "API v1" }],
		components: {
			securitySchemes: {
				cookieAuth: {
					type: "apiKey",
					in: "cookie",
					name: "access_token",
				},
			},
		},
	},
	apis: ["./src/routes/api/v1/*.routes.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
