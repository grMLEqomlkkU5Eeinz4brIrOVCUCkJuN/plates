import swaggerJsdoc from "swagger-jsdoc";
import { env } from "./env";

const options: swaggerJsdoc.Options = {
	definition: {
		openapi: "3.0.0",
		info: {
			title: env.SERVICE_NAME,
			version: "1.0.0",
			description: "API documentation",
		},
		servers: [
			{
				url: `/api/v1`,
				description: "API v1",
			},
		],
	},
	apis: ["./src/routes/api/v1/*.routes.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
