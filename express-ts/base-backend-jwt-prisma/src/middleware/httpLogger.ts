import morgan, { StreamOptions } from "morgan";
import { Request } from "express";
import { env } from "../config/env";
import logger from "../utils/logger";

const stream: StreamOptions = {
	write: (message: string) => {
		logger.http(message.trim());
	},
};

const skip = (): boolean => env.NODE_ENV === "test";

// Without this a log line cannot be tied to the error the same request
// produced, which is the only thing anyone wants from an access log at 3am.
morgan.token("request-id", (req) => (req as Request).requestId ?? "-");

const format =
	env.NODE_ENV === "production"
		? ":request-id :remote-addr :method :url :status :res[content-length] - :response-time ms"
		: ":request-id :method :url :status :response-time ms";

export const httpLogger = morgan(format, { stream, skip });
