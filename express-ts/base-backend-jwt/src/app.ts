import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env";
import { httpLogger } from "./middleware/httpLogger";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import routes from "./routes";
import { buildOpenApiDocument } from "./openapi";

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

	// Cookie parsing
	app.use(cookieParser(env.COOKIE_SECRET));

	// Body parsing
	app.use(express.json());
	app.use(express.urlencoded({ extended: true }));

	// HTTP logging
	app.use(httpLogger);

	// API documentation, kept out of production so it does not map the API for
	// anyone who finds the host. openapi.json in the repo is the same document.
	if (env.NODE_ENV !== "production") {
		const openApiDocument = buildOpenApiDocument();
		app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
		app.get("/docs.json", (_req, res) => res.json(openApiDocument));
	}

	// Routes (handles /api/v1, etc.)
	app.use(routes);

	// Error handling
	app.use(notFoundHandler);
	app.use(errorHandler);

	return app;
};
