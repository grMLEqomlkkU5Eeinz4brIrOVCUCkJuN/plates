import morgan, { StreamOptions } from "morgan";
import { env } from "../config/env";
import logger from "../utils/logger";

const stream: StreamOptions = {
	write: (message: string) => {
		logger.http(message.trim());
	},
};

const skip = () => env.NODE_ENV === "test";

const format = env.NODE_ENV === "production"
	? ":remote-addr :method :url :status :res[content-length] - :response-time ms"
	: ":method :url :status :response-time ms";

export const httpLogger = morgan(format, { stream, skip });
