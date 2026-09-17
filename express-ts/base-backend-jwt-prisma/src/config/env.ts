import { z } from "zod";
import { stringToArray } from "../utils/helpers";

/**
 * Two RFC 1123 labels or more. A single label ("localhost", a container name)
 * cannot work: a Domain attribute has to be a suffix of the request host, and
 * browsers drop a cookie whose Domain is not. The leading dot is stripped
 * before this runs; RFC 6265 reads ".example.com" and "example.com" alike.
 */
const COOKIE_DOMAIN_PATTERN =
	/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

type BoolFromEnv = z.ZodPipe<
	z.ZodDefault<z.ZodEnum<{ true: "true"; false: "false" }>>,
	z.ZodTransform<boolean, "true" | "false">
>;

// `.default()` has to sit before `.transform()`, or the fallback is typed as
// the output and "true" never becomes a boolean.
const boolFromEnv = (fallback: "true" | "false"): BoolFromEnv =>
	z
		.enum(["true", "false"])
		.default(fallback)
		.transform((val) => val === "true");

const secret = (name: string): z.ZodString =>
	z
		.string(`${name} is required. Generate one with: openssl rand -base64 48`)
		.min(32, `${name} must be at least 32 characters.`);

/**
 * Express's `trust proxy` setting, parsed rather than passed through as a
 * string. `true` trusts the X-Forwarded-For chain from any source, which hands
 * every client the ability to forge its own IP, and req.ip is what the rate
 * limiter keys on and what middleware/csrf.ts falls back to for anonymous
 * callers. The production refinement below rejects it.
 */
const trustProxy = z
	.string()
	.default("false")
	.transform((val): boolean | number | string[] => {
		if (val === "false") return false;
		if (val === "true") return true;
		if (/^\d+$/.test(val)) return Number(val);
		return stringToArray(val);
	});

const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	PORT: z.coerce.number().int().positive().default(3000),
	HOST: z.string().default("0.0.0.0"),
	// "http" rather than "info", because the access log morgan writes sits at
	// that level and it carries the request ids everything else correlates on.
	LOG_LEVEL: z
		.enum(["error", "warn", "info", "http", "verbose", "debug", "silly"])
		.default("http"),
	SERVICE_NAME: z.string().default("jwt-prisma-backend"),
	// Resolved from the working directory, not from the source file, so a
	// container can mount a volume here and the path does not change between
	// `tsx src/main.ts` and `node dist/main.js`.
	LOG_DIR: z.string().default("logs"),
	MAX_LOG_SIZE: z.string().default("20m"),
	MAX_LOG_FILES: z.string().default("14d"),
	COMPRESS_LOGS: boolFromEnv("true"),

	CORS_ORIGIN: z
		.string()
		.default("*")
		.transform((val) => (val === "*" ? "*" : stringToArray(val))),
	CORS_METHODS: z
		.string()
		.default("GET,POST,PUT,PATCH,DELETE,OPTIONS")
		.transform(stringToArray),
	// Defaults to false so that it does not contradict the CORS_ORIGIN default
	// above. Turn it on and you must name an origin; see the refinement at the
	// bottom of this file.
	CORS_CREDENTIALS: boolFromEnv("false"),

	TRUST_PROXY: trustProxy,

	// Auth bodies are a few hundred bytes. express.json() defaults to 100kb;
	// naming it here means the number moves for a reason rather than by
	// accident when a later endpoint needs more.
	JSON_BODY_LIMIT: z.string().default("64kb"),

	// How long main.ts waits for in-flight requests before dropping them.
	// Keep it under the grace period of whatever stops the process (Kubernetes
	// gives 30s by default), or the orchestrator kills the drain halfway.
	SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

	// prisma.config.ts reads the same variable for the CLI (migrations, studio),
	// so the app and `npx prisma migrate dev` always talk to one database.
	DATABASE_URL: z
		.string("DATABASE_URL is required, e.g. postgresql://user:password@localhost:5432/db")
		.refine((val) => /^postgres(ql)?:\/\//.test(val), {
			message: "DATABASE_URL must be a postgres:// or postgresql:// connection string.",
		}),
	// Per-process connection ceiling. Postgres shares one global
	// max_connections (100 by default) across every client, so treat this as a
	// slice of that budget: replicas x DATABASE_POOL_MAX, plus headroom for
	// migrations and a human with psql, has to stay under it.
	DATABASE_POOL_MAX: z.coerce.number().int().positive().max(100).default(10),
	// Return idle connections rather than holding them. Managed Postgres and
	// NAT gateways both drop idle TCP sessions without telling either end.
	DATABASE_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
	// Fail fast when the pool is exhausted instead of hanging on it.
	DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
	// Postgres cancels a statement that runs past this. Without it one bad
	// query holds a pool slot until the client gives up, and the pool is what
	// every other request is queueing on.
	DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

	// Applied to the credential endpoints (register, login, refresh, account
	// deletion), per address and per email. In-process only; see the caveat at
	// the top of middleware/rateLimit.ts before running more than one replica.
	RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
	RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),

	JWT_SECRET: secret("JWT_SECRET"),
	// Short, because an access token is never checked against the database:
	// revoking a session takes effect when the access token expires.
	JWT_ACCESS_EXPIRY: z.string().default("15m"),
	// Refresh tokens are opaque rows, not JWTs, so there is no second secret.
	REFRESH_TOKEN_EXPIRY: z.string().default("7d"),

	// argon2id cost. The defaults are the OWASP floor (19 MiB, 2 passes); the
	// committed .env.test lowers them so a suite that hashes on every login
	// does not take a coffee break. Raising them later is free: verify still
	// reads the parameters out of each stored hash.
	ARGON2_MEMORY_KIB: z.coerce.number().int().min(1024).default(19_456),
	ARGON2_TIME_COST: z.coerce.number().int().min(1).default(2),

	COOKIE_SECURE: boolFromEnv("true"),
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

	CSRF_SECRET: secret("CSRF_SECRET"),
});

const configSchema = envSchema.superRefine((cfg, ctx) => {
	// A browser refuses a credentialed response carrying
	// `Access-Control-Allow-Origin: *`, so the pairing cannot work; it can only
	// fail later, at the point a real user tries to log in.
	if (cfg.CORS_ORIGIN === "*" && cfg.CORS_CREDENTIALS) {
		ctx.addIssue({
			code: "custom",
			path: ["CORS_ORIGIN"],
			message:
				"CORS_ORIGIN=* cannot be combined with CORS_CREDENTIALS=true; browsers reject credentialed requests against a wildcard origin. Name the origins you serve.",
		});
	}

	// A SameSite=None cookie without Secure is discarded by the browser on
	// arrival: login returns 200, the Set-Cookie header reads correctly, and
	// the next request carries no session.
	if (cfg.COOKIE_SAME_SITE === "none" && !cfg.COOKIE_SECURE) {
		ctx.addIssue({
			code: "custom",
			path: ["COOKIE_SAME_SITE"],
			message:
				"COOKIE_SAME_SITE=none requires COOKIE_SECURE=true; browsers drop a SameSite=None cookie that is not Secure.",
		});
	}

	if (cfg.NODE_ENV === "production" && cfg.TRUST_PROXY === true) {
		ctx.addIssue({
			code: "custom",
			path: ["TRUST_PROXY"],
			message:
				"TRUST_PROXY=true trusts a forwarded-for header from any source. In production give the hop count or the proxy addresses.",
		});
	}
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
	const { fieldErrors, formErrors } = z.flattenError(parsed.error);

	const lines = [
		"Invalid environment. See .env.production.example for the full contract.",
		"",
		...Object.entries(fieldErrors).map(
			([key, messages]) => `  ${key}: ${(messages as string[]).join(" ")}`
		),
		...formErrors.map((message) => `  ${message}`),
	];

	// Thrown, not process.exit: jest imports this module too and needs to
	// report a bad environment rather than have the worker vanish under it.
	// main.ts imports it first, so an unhandled throw here still stops the
	// server from starting, with this message as the last thing printed.
	throw new Error(lines.join("\n"));
}

export const env = parsed.data;
