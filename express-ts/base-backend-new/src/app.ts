import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger";
import { env } from "./config/env";
import { httpLogger } from "./middleware/httpLogger";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import routes from "./routes";

export const createApp = (): Express => {
	const app = express();

	// Security middleware
	app.use(
		helmet({
			contentSecurityPolicy: env.NODE_ENV === "production",
			crossOriginEmbedderPolicy: env.NODE_ENV === "production",
		})
	);

	app.use(
		cors({
			origin: env.CORS_ORIGIN,
			methods: env.CORS_METHODS,
			credentials: env.CORS_CREDENTIALS,
		})
	);

	// Body parsing
	app.use(express.json());
	app.use(express.urlencoded({ extended: true }));

	// HTTP logging
	app.use(httpLogger);

	// API documentation
	app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
	app.get("/docs.json", (_req, res) => res.json(swaggerSpec));

	// Routes (handles /api/v1, etc.)
	app.use(routes);

	// Error handling
	app.use(notFoundHandler);
	app.use(errorHandler);

	return app;
};
