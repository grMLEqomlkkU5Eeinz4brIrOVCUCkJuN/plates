import http from "http";
import { createApp } from "./app";
import { env } from "./config/env";
import logger from "./utils/logger";

const app = createApp();
const server = http.createServer(app);

const shutdown = (signal: string) => {
	logger.info(`${signal} received, starting graceful shutdown...`);

	server.close((err) => {
		if (err) {
			logger.error("Error during server close", { error: err.message });
			process.exit(1);
		}

		logger.info("Server closed successfully");
		process.exit(0);
	});

	// Force shutdown after timeout
	setTimeout(() => {
		logger.error("Graceful shutdown timed out, forcing exit");
		process.exit(1);
	}, 10000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", (error) => {
	logger.error("Uncaught exception", { error: error.message, stack: error.stack });
	shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
	logger.error("Unhandled rejection", { reason });
	shutdown("unhandledRejection");
});

server.listen(env.PORT, () => {
	logger.info(`Server running on port ${env.PORT}`);
	logger.info(`Environment: ${env.NODE_ENV}`);
	logger.info(`API docs available at http://localhost:${env.PORT}/docs`);
});
