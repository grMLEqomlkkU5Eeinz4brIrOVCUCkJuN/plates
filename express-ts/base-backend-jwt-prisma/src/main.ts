import type { Server } from "node:http";
import { createApp } from "./app";
import { env } from "./config/env";
import { disconnectDatabase, pingDatabase } from "./db/prisma";
import { stopRateLimitSweep } from "./middleware/rateLimit";
import logger from "./utils/logger";

const app = createApp();

let server: Server | undefined;
let shuttingDown = false;

/**
 * `code` is what the process exits with once the server has closed, and it is the
 * difference between "asked to stop" and "fell over". A signal is an orderly stop and
 * exits 0; a crash exits 1, so that an orchestrator sees a failed container, restart
 * counters move, and a crash loop is visible instead of looking like a clean shutdown.
 */
const shutdown = (signal: string, code = 0): void => {
	// A second SIGTERM while draining, or a crash during the drain, would
	// otherwise start a second close and a second timer.
	if (shuttingDown) return;
	shuttingDown = true;

	logger.info(`${signal} received, starting graceful shutdown`);

	const forceExit = setTimeout(() => {
		logger.error("Graceful shutdown timed out, dropping in-flight connections");
		server?.closeAllConnections();
		process.exit(1);
	}, env.SHUTDOWN_TIMEOUT_MS);

	// Last, because in-flight requests were still using it. An unclosed pool
	// holds its Postgres connections until the server times them out on its
	// own schedule, so a rolling restart transiently needs twice the
	// connection budget; it also keeps the event loop alive, so without this
	// the process waits out the timer above instead of exiting on its own.
	const closePool = (exitCode: number): void => {
		clearTimeout(forceExit);
		stopRateLimitSweep();

		disconnectDatabase()
			.catch((error: unknown) => {
				logger.error("Error closing the database pool", {
					error: error instanceof Error ? error.message : String(error),
				});
				exitCode = 1;
			})
			.finally(() => {
				logger.info("Shutdown complete");
				process.exit(exitCode);
			});
	};

	// Startup failed before listen: there is nothing to drain.
	if (!server) {
		closePool(code);
		return;
	}

	// Stop accepting new connections, then drop the keep-alive sockets that
	// are sitting idle between requests. Without the second call the drain
	// waits out every idle client's keep-alive timeout, which is the usual
	// reason a "graceful" shutdown always hits its own deadline.
	server.close((err) => {
		if (err) {
			logger.error("Error during server close", { error: err.message });
			code = 1;
		}

		closePool(code);
	});

	server.closeIdleConnections();
};

/**
 * Prisma opens the pool on the first query, not at import. Asking for the
 * connection here turns a wrong DATABASE_URL, an unreachable host or a database
 * that has not been migrated into a process that never comes up, rather than a
 * healthy-looking service that 500s on the first request to touch a table.
 */
const start = async (): Promise<void> => {
	await pingDatabase();
	logger.info("Database connected");

	server = app.listen(env.PORT, env.HOST, () => {
		logger.info(`Server listening on ${env.HOST}:${env.PORT}`, {
			environment: env.NODE_ENV,
		});
	});

	// A client that opens a socket and sends its request one byte at a time
	// holds a connection until Node gives up. Every request here is a small
	// JSON body, so the budget is short.
	server.requestTimeout = 30_000;
	server.headersTimeout = 20_000;
};

start().catch((error: unknown) => {
	logger.error("Startup failed", {
		error: error instanceof Error ? error.message : String(error),
	});
	shutdown("startup", 1);
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
