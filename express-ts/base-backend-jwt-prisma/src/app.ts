import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger";
import { env } from "./config/env";
import { requestId } from "./middleware/requestId";
import { httpLogger } from "./middleware/httpLogger";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import routes from "./routes";

export const createApp = (): Express => {
	const app = express();

	// req.ip comes from this. Left at the default behind a proxy, the rate
	// limiter buckets every client under the proxy's address and csrf.ts
	// gives every anonymous caller one shared session; set to `true`, any
	// client can forge its own address. env.ts refuses `true` in production.
	app.set("trust proxy", env.TRUST_PROXY);

	// Nothing here renders HTML, so there is no view state to protect.
	// Express's fingerprint header is still free to remove.
	app.disable("x-powered-by");

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

	app.use(requestId);

	// req.cookies is what csrf-csrf reads its cookie from. The access cookie
	// is read from the raw header instead (middleware/auth.ts), because
	// cookie-parser picks the first of two same-named cookies and that guess
	// is the one an attacker would arrange.
	app.use(cookieParser());

	// JSON only. Every client of this API posts JSON, so an urlencoded parser
	// would only widen what an unwritten endpoint accepts.
	app.use(express.json({ limit: env.JSON_BODY_LIMIT }));

	app.use(httpLogger);

	// The schema browser is a development tool, not a product surface: in
	// production it publishes the route list to anyone who finds it.
	if (env.NODE_ENV !== "production") {
		app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
		app.get("/docs.json", (_req, res) => res.json(swaggerSpec));
	}

	app.use(routes);

	app.use(notFoundHandler);
	app.use(errorHandler);

	return app;
};
