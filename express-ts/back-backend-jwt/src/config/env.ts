import { z } from "zod";
import dotenv from "dotenv";
import { stringToArray } from "../utils/helpers.js";

dotenv.config();

const envSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
	PORT: z.coerce.number().default(3000),
	LOG_LEVEL: z.enum(["error", "warn", "info", "http", "verbose", "debug", "silly"]).default("info"),
	SERVICE_NAME: z.string().default("jwt-backend"),
	MAX_LOG_SIZE: z.string().default("20m"),
	MAX_LOG_FILES: z.string().default("14d"),
	COMPRESS_LOGS: z
		.enum(["true", "false"])
		.default("true")
		.transform((val) => val === "true"),

	// CORS configuration
	CORS_ORIGIN: z
		.string()
		.default("*")
		.transform((val) => (val === "*" ? "*" : stringToArray(val))),
	CORS_METHODS: z
		.string()
		.default("GET,POST,PUT,PATCH,DELETE,OPTIONS")
		.transform(stringToArray),
	CORS_CREDENTIALS: z
		.enum(["true", "false"])
		.default("true")
		.transform((val) => val === "true"),

	// Security configuration
	RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000), // 15 minutes
	RATE_LIMIT_MAX: z.coerce.number().default(100),

	// JWT configuration
	JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
	JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
	JWT_ACCESS_EXPIRY: z.string().default("15m"),
	JWT_REFRESH_EXPIRY: z.string().default("7d"),

	// Cookie configuration
	COOKIE_SECRET: z.string().min(32, "COOKIE_SECRET must be at least 32 characters"),
	COOKIE_SECURE: z
		.enum(["true", "false"])
		.default("true")
		.transform((val) => val === "true"),
	COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).default("strict"),

	// CSRF configuration
	CSRF_SECRET: z.string().min(32, "CSRF_SECRET must be at least 32 characters"),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
	console.error("Invalid environment variables:", z.flattenError(parsed.error).fieldErrors);
	process.exit(1);
}

export const env = parsed.data;
