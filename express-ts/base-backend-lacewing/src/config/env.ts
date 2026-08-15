import { z } from "zod";
import dotenv from "dotenv";
import { stringToArray } from "../utils/helpers.js";

dotenv.config();

const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	PORT: z.coerce.number().default(3000),
	LOG_LEVEL: z
		.enum(["error", "warn", "info", "http", "verbose", "debug", "silly"])
		.default("info"),
	SERVICE_NAME: z.string().default("lacewing-backend"),
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
	// Defaults to false so that it does not contradict the CORS_ORIGIN default
	// above. Turn it on and you must name an origin - see the refine at the
	// bottom of this file. .env.example does exactly that.
	CORS_CREDENTIALS: z
		.enum(["true", "false"])
		.default("false")
		.transform((val) => val === "true"),

	// Security configuration
	RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000), // 15 minutes
	RATE_LIMIT_MAX: z.coerce.number().default(100),

	// JWT configuration. The 32-character floor here is only the first
	// gate: lacewing entropy-checks the secrets at import, so a
	// human-chosen passphrase fails at boot even when it is long enough.
	// `npm run secrets` prints values that pass.
	JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
	JWT_REFRESH_SECRET: z
		.string()
		.min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
	// Access expiry above 1h will be refused at sign time - that is
	// lacewing's cap on access tokens, and it is deliberate.
	JWT_ACCESS_EXPIRY: z.string().default("15m"),
	JWT_REFRESH_EXPIRY: z.string().default("7d"),
	// Who mints tokens and who they are for. Verification pins both.
	JWT_ISSUER: z.string().default("http://localhost:3000"),
	JWT_AUDIENCE: z.string().default("http://localhost:3000/api/v1"),

	// Cookie configuration. There is no COOKIE_SECURE switch: every cookie
	// this template sets is HttpOnly; Secure, unconditionally. Browsers
	// treat http://localhost as a secure context, so dev still works.
	COOKIE_SECRET: z
		.string()
		.min(32, "COOKIE_SECRET must be at least 32 characters"),
	// "none" is not an option - cross-site token cookies are how CSRF happens.
	COOKIE_SAME_SITE: z.enum(["strict", "lax"]).default("strict"),

	// CSRF configuration
	CSRF_SECRET: z
		.string()
		.min(32, "CSRF_SECRET must be at least 32 characters"),
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
