import http from "http";
import { createApp } from "./app";
import { env } from "./config/env";
import logger from "./utils/logger";

const app = createApp();
const server = http.createServer(app);

/**
 * `code` is what the process exits with once the server has closed, and it is the
 * difference between "asked to stop" and "fell over". A signal is an orderly stop and
 * exits 0; a crash exits 1, so that an orchestrator sees a failed container, restart
 * counters move, and a crash loop is visible instead of looking like a clean shutdown.
 */
const shutdown = (signal: string, code = 0): void => {
	logger.info(`${signal} received, starting graceful shutdown...`);

	server.close((err) => {
		if (err) {
			logger.error("Error during server close", { error: err.message });
			process.exit(1);
		}

		logger.info("Server closed successfully");
		process.exit(code);
	});

	// Force shutdown after timeout
	setTimeout(() => {
		logger.error("Graceful shutdown timed out, forcing exit");
		process.exit(1);
	}, 10000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Past this point the process is in a state nobody designed. Draining is a courtesy to
// in-flight requests, not a recovery - it still exits non-zero.
process.on("uncaughtException", (error) => {
	logger.error("Uncaught exception", {
		error: error.message,
		stack: error.stack,
	});
	shutdown("uncaughtException", 1);
});

process.on("unhandledRejection", (reason) => {
	logger.error("Unhandled rejection", { reason });
	shutdown("unhandledRejection", 1);
});

server.listen(env.PORT, () => {
	logger.info(`Server running on port ${env.PORT}`);
	logger.info(`Environment: ${env.NODE_ENV}`);
	logger.info(`API docs available at http://localhost:${env.PORT}/docs`);
});
