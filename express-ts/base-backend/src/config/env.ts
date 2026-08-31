import { z } from "zod";
import { stringToArray } from "../utils/helpers.js";

const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	PORT: z.coerce.number().default(3000),
	LOG_LEVEL: z
		.enum(["error", "warn", "info", "http", "verbose", "debug", "silly"])
		.default("info"),
	SERVICE_NAME: z.string().default("base-backend"),
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
		.default("false")
		.transform((val) => val === "true"),

	// Security configuration
	RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000), // 15 minutes
	RATE_LIMIT_MAX: z.coerce.number().default(100),
});

/**
 * A wildcard origin and credentialed requests are mutually exclusive: a browser
 * refuses a credentialed response carrying `Access-Control-Allow-Origin: *`, so
 * the combination cannot work - it can only fail later, at the point a real user
 * tries to log in. Fail here instead, where the message says why.
 */
const configSchema = envSchema.refine(
	(cfg) => !(cfg.CORS_ORIGIN === "*" && cfg.CORS_CREDENTIALS),
	{
		message:
			"CORS_ORIGIN=* cannot be combined with CORS_CREDENTIALS=true - browsers reject credentialed requests against a wildcard origin. Name the origins you serve.",
	}
);

export type Env = z.infer<typeof envSchema>;

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
	const { fieldErrors, formErrors } = z.flattenError(parsed.error);

	// The logger depends on env, so it does not exist yet at this point.
	// eslint-disable-next-line no-console
	console.error("Invalid environment variables:", fieldErrors);

	// Cross-field problems (the CORS pair above) land in formErrors, not
	// fieldErrors - printing only the latter would report nothing at all.
	if (formErrors.length > 0) {
		// eslint-disable-next-line no-console
		console.error(formErrors.join("\n"));
	}

	process.exit(1);
}

export const env = parsed.data;
