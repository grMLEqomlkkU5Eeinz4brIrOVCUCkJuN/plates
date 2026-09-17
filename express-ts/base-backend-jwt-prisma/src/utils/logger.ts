import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import { env } from "../config/env";

const logDir = path.resolve(env.LOG_DIR);

/** Replace raw Error objects in metadata with plain objects so JSON.stringify captures message+stack. */
const serializeErrors = winston.format((info) => {
	for (const key of Object.keys(info)) {
		if (info[key] instanceof Error) {
			const err = info[key] as Error;
			info[key] = { ...err, message: err.message, stack: err.stack };
		}
	}
	return info;
});

/**
 * Secrets are unloggable by construction rather than by remembering.
 *
 * Redacting here rather than at each call site means a new handler cannot log
 * a password or a token by forgetting: the value is removed on the way into
 * the transport. Depth is capped because log metadata is not always the shape
 * you think, and a cycle in it would take the process down from inside the
 * logger.
 */
const SENSITIVE_KEY = /pass(word|phrase)?|secret|token|credential|authorization|cookie|csrf/i;
const MAX_REDACTION_DEPTH = 5;

const redactValue = (value: unknown, depth: number): unknown => {
	if (depth > MAX_REDACTION_DEPTH) return "[truncated]";
	if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
	if (value === null || typeof value !== "object") return value;

	const source = value as Record<string, unknown>;
	const output: Record<string, unknown> = {};

	for (const [key, nested] of Object.entries(source)) {
		output[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redactValue(nested, depth + 1);
	}

	return output;
};

export const redactSecrets = winston.format((info) => {
	for (const key of Object.keys(info)) {
		if (key === "level" || key === "message") continue;
		info[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redactValue(info[key], 0);
	}
	return info;
});

const printLine = winston.format.printf(({ timestamp, level, message, ...meta }) => {
	let msg = `${timestamp} [${level}]: ${message}`;
	if (Object.keys(meta).length > 0) {
		msg += ` ${JSON.stringify(meta)}`;
	}
	return msg;
});

const consoleFormat = winston.format.combine(
	serializeErrors(),
	redactSecrets(),
	winston.format.colorize(),
	winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
	printLine
);

const fileFormat = winston.format.combine(
	serializeErrors(),
	redactSecrets(),
	winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
	printLine
);

const fileTransportOptions = {
	datePattern: "YYYY-MM-DD",
	maxSize: env.MAX_LOG_SIZE,
	maxFiles: env.MAX_LOG_FILES,
	zippedArchive: env.COMPRESS_LOGS,
};

const transports: winston.transport[] = [
	new winston.transports.Console({
		level: env.LOG_LEVEL,
		format: consoleFormat,
		// Tests assert on responses, not on stderr, and a rotating file
		// transport per suite leaves a litter of dated logs.
		silent: env.NODE_ENV === "test",
	}),
];

if (env.NODE_ENV !== "test") {
	transports.push(
		new DailyRotateFile({
			...fileTransportOptions,
			filename: path.join(logDir, "error-%DATE%.log"),
			level: "error",
			format: fileFormat,
		}),
		new DailyRotateFile({
			...fileTransportOptions,
			filename: path.join(logDir, "combined-%DATE%.log"),
			format: fileFormat,
		})
	);
}

const logger = winston.createLogger({
	level: env.LOG_LEVEL,
	format: fileFormat,
	defaultMeta: { service: env.SERVICE_NAME },
	transports,
	// winston's exception handler exits the process itself by default, which
	// races the drain in main.ts and usually wins. Logging is winston's job
	// here; deciding when the process dies is main.ts's.
	exitOnError: false,
});

if (env.NODE_ENV !== "test") {
	logger.exceptions.handle(
		new DailyRotateFile({
			...fileTransportOptions,
			filename: path.join(logDir, "exceptions-%DATE%.log"),
			format: fileFormat,
		})
	);
	logger.rejections.handle(
		new DailyRotateFile({
			...fileTransportOptions,
			filename: path.join(logDir, "rejections-%DATE%.log"),
			format: fileFormat,
		})
	);
}

if (env.NODE_ENV === "development") {
	logger.exceptions.handle(
		new winston.transports.Console({ format: consoleFormat })
	);
	logger.rejections.handle(
		new winston.transports.Console({ format: consoleFormat })
	);
}

export default logger;
