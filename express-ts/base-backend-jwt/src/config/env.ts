import { z } from "zod";
import dotenv from "dotenv";
import { stringToArray } from "../utils/helpers.js";

dotenv.config();

/**
 * Two RFC 1123 labels or more. A single label ("localhost", a container name)
 * cannot work: a Domain attribute has to be a suffix of the request host, and
 * browsers drop a cookie whose Domain is not. The leading dot is stripped
 * before this runs; RFC 6265 reads ".example.com" and "example.com" alike.
 */
const COOKIE_DOMAIN_PATTERN =
	/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	PORT: z.coerce.number().default(3000),
	LOG_LEVEL: z
		.enum(["error", "warn", "info", "http", "verbose", "debug", "silly"])
		.default("info"),
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

	// JWT configuration
	JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
	JWT_REFRESH_SECRET: z
		.string()
		.min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
	JWT_ACCESS_EXPIRY: z.string().default("15m"),
	JWT_REFRESH_EXPIRY: z.string().default("7d"),

	// Cookie configuration
	COOKIE_SECRET: z
		.string()
		.min(32, "COOKIE_SECRET must be at least 32 characters"),
	COOKIE_SECURE: z
		.enum(["true", "false"])
		.default("true")
		.transform((val) => val === "true"),
	COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).default("strict"),
	// Unset leaves every cookie host-only: only the host that set it gets it
	// back, which is what a single API hostname wants and the only thing that
	// works on localhost. Set the shared parent (example.com) when more than
	// one host has to see the session - auth.example.com minting one that
	// api.example.com verifies. middleware/csrf.ts HMACs each CSRF token
	// against the access-token cookie, so the two need the same scope: where
	// the CSRF cookie does not reach, valid requests fail the check with a 403.
	// A Domain cookie also reaches every subdomain under it, including ones you
	// do not run, so name the narrowest parent that covers your hosts.
	COOKIE_DOMAIN: z
		.string()
		.trim()
		.optional()
		.transform((val) => (val ? val.replace(/^\./, "") : undefined))
		.refine((val) => val === undefined || COOKIE_DOMAIN_PATTERN.test(val), {
			message:
				'COOKIE_DOMAIN must be a bare parent domain like "example.com": no scheme, no port, no path, at least two labels. Leave it unset on localhost and wherever one host serves everything.',
		}),

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
const configSchema = envSchema
	.refine((cfg) => !(cfg.CORS_ORIGIN === "*" && cfg.CORS_CREDENTIALS), {
		message:
			"CORS_ORIGIN=* cannot be combined with CORS_CREDENTIALS=true - browsers reject credentialed requests against a wildcard origin. Name the origins you serve.",
	})
	/**
	 * A SameSite=None cookie without Secure is discarded by the browser on
	 * arrival: login returns 200, the Set-Cookie header reads correctly, and
	 * the next request carries no session.
	 */
	.refine((cfg) => !(cfg.COOKIE_SAME_SITE === "none" && !cfg.COOKIE_SECURE), {
		message:
			"COOKIE_SAME_SITE=none requires COOKIE_SECURE=true - browsers drop a SameSite=None cookie that is not Secure.",
	});

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
