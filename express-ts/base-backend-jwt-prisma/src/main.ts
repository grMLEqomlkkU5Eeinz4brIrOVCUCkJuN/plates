import type { Server } from "node:http";
import { createApp } from "./app";
import { env } from "./config/env";
import { connectDatabase, disconnectDatabase } from "./db/prisma";
import logger from "./utils/logger";

const app = createApp();

let server: Server | undefined;

/**
 * `code` is what the process exits with once the server has closed, and it is the
 * difference between "asked to stop" and "fell over". A signal is an orderly stop and
 * exits 0; a crash exits 1, so that an orchestrator sees a failed container, restart
 * counters move, and a crash loop is visible instead of looking like a clean shutdown.
 */
const shutdown = (signal: string, code = 0): void => {
	logger.info(`${signal} received, starting graceful shutdown...`);

	// The pool outlives the last response: idle Postgres sockets keep the event
	// loop alive, so without this the process waits out the timeout below
	// instead of exiting on its own.
	const closePool = (exitCode: number): void => {
		disconnectDatabase()
			.catch((error: unknown) => {
				logger.error("Error closing the database pool", { error });
			})
			.finally(() => {
				process.exit(exitCode);
			});
	};

	if (!server) {
		closePool(code);
		return;
	}

	server.close((err) => {
		if (err) {
			logger.error("Error during server close", { error: err.message });
			closePool(1);
			return;
		}

		logger.info("Server closed successfully");
		closePool(code);
	});

	// Force shutdown after timeout
	setTimeout(() => {
		logger.error("Graceful shutdown timed out, forcing exit");
		process.exit(1);
	}, 10000);
};

/**
 * Prisma opens the pool on the first query, not at import. Asking for the
 * connection here turns a wrong DATABASE_URL, an unreachable host or a database
 * that has not been migrated into a process that never comes up - rather than a
 * healthy-looking service that 500s on the first request to touch a table.
 */
const start = async (): Promise<void> => {
	await connectDatabase();
	logger.info("Database connected");

	server = app.listen(env.PORT, () => {
		logger.info(`Server running on port ${env.PORT}`);
		logger.info(`Environment: ${env.NODE_ENV}`);
		logger.info(
			`API docs available at http://localhost:${env.PORT}/docs`
		);
	});
};

start().catch((error: unknown) => {
	logger.error("Startup failed", { error });
	process.exit(1);
});

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
