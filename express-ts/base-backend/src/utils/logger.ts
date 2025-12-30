import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import { env } from "../config/env";

const logDir = path.join(__dirname, "..", "..", "logs");

const consoleFormat = winston.format.combine(
	winston.format.colorize(),
	winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
	winston.format.printf(({ timestamp, level, message, ...meta }) => {
		let msg = `${timestamp} [${level}]: ${message}`;
		if (Object.keys(meta).length > 0) {
			msg += ` ${JSON.stringify(meta)}`;
		}
		return msg;
	})
);

const fileFormat = winston.format.combine(
	winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
	winston.format.printf(({ timestamp, level, message, ...meta }) => {
		let msg = `${timestamp} [${level}]: ${message}`;
		if (Object.keys(meta).length > 0) {
			msg += ` ${JSON.stringify(meta)}`;
		}
		return msg;
	})
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
	}),
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
	}),
];

const logger = winston.createLogger({
	level: env.LOG_LEVEL,
	format: fileFormat,
	defaultMeta: { service: env.SERVICE_NAME },
	transports,
	exceptionHandlers: [
		new DailyRotateFile({
			...fileTransportOptions,
			filename: path.join(logDir, "exceptions-%DATE%.log"),
			format: fileFormat,
		}),
	],
	rejectionHandlers: [
		new DailyRotateFile({
			...fileTransportOptions,
			filename: path.join(logDir, "rejections-%DATE%.log"),
			format: fileFormat,
		}),
	],
});

if (env.NODE_ENV !== "production") {
	logger.exceptions.handle(
		new winston.transports.Console({ format: consoleFormat })
	);
	logger.rejections.handle(
		new winston.transports.Console({ format: consoleFormat })
	);
}

export default logger;
