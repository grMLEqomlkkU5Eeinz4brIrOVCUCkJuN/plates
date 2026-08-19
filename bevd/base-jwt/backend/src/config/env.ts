import { type } from "arktype";

/**
 * Two RFC 1123 labels or more. A single label ("localhost", a container name)
 * cannot work: a Domain attribute has to be a suffix of the request host, and
 * browsers drop a cookie whose Domain is not.
 */
const CookieDomain = type(/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i).describe(
	'a bare parent domain like "example.com": no scheme, no port, no path, at least two labels (leave COOKIE_DOMAIN unset on localhost or where one host serves everything)',
);

const Env = type({
	NODE_ENV: "'development' | 'test' | 'production'",
	PORT: "1 <= number <= 65535",
	GRPC_PORT: "1 <= number <= 65535",
	LOG_LEVEL: "'debug' | 'info' | 'warn' | 'error' | 'silent'",
	// Tags every log line, so one stream can carry more than one service.
	SERVICE_NAME: "string > 0",
	DATABASE_URL: "string > 0",
	CORS_ORIGIN: "string > 0",

	// 32 characters is not decoration: an HS256 key shorter than the hash it feeds is
	// the weak link. The app refuses to boot rather than sign tokens with a short one.
	JWT_SECRET: "string >= 32",
	// Anything jose accepts: "15m", "1h", "7d".
	JWT_ACCESS_EXPIRY: "string > 0",
	REFRESH_TOKEN_TTL_DAYS: "1 <= number <= 365",

	// Cookies must be Secure in production; over plain http in dev the browser drops them.
	COOKIE_SECURE: "boolean",
	COOKIE_SAME_SITE: "'lax' | 'strict' | 'none'",
	// Unset leaves the cookies host-only: only the host that set them gets them
	// back, which is what localhost and one hostname serving both halves want.
	// Split the app and the API across api.example.com and app.example.com and
	// the frontend host never receives them, so a login that returned 200 is
	// followed by requests with no session on them. COOKIE_DOMAIN=example.com
	// scopes them to the shared parent, at the price of reaching every
	// subdomain under it, including ones you do not run.
	"COOKIE_DOMAIN?": CookieDomain,
})
	/**
	 * A SameSite=None cookie without Secure is discarded by the browser on
	 * arrival: login returns 200, the Set-Cookie header reads correctly, and
	 * the next request carries no session.
	 */
	.narrow((cfg, ctx) => {
		if (cfg.COOKIE_SAME_SITE === "none" && !cfg.COOKIE_SECURE) {
			return ctx.reject({
				expected: "COOKIE_SECURE=true, which SameSite=None requires",
				actual: "COOKIE_SECURE=false",
				path: ["COOKIE_SECURE"],
			});
		}

		return true;
	});

const cookieDomain = (process.env.COOKIE_DOMAIN ?? "").trim().replace(/^\./, "");

// Defaults are applied before validation so the schema stays a plain shape check -
// no morphs, no surprises about whether a default is validated as input or output.
const result = Env({
	NODE_ENV: process.env.NODE_ENV ?? "development",
	PORT: Number(process.env.PORT ?? 3000),
	GRPC_PORT: Number(process.env.GRPC_PORT ?? 50051),
	LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
	SERVICE_NAME: process.env.SERVICE_NAME ?? "bevd-jwt-backend",
	DATABASE_URL: process.env.DATABASE_URL ?? "",
	CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:5173",
	JWT_SECRET: process.env.JWT_SECRET ?? "",
	JWT_ACCESS_EXPIRY: process.env.JWT_ACCESS_EXPIRY ?? "15m",
	REFRESH_TOKEN_TTL_DAYS: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 7),
	COOKIE_SECURE: process.env.COOKIE_SECURE === "true",
	COOKIE_SAME_SITE: process.env.COOKIE_SAME_SITE ?? "lax",
	// Absent rather than "", because absent is what leaves the cookies
	// host-only. RFC 6265 reads ".example.com" and "example.com" alike, so the
	// dot is stripped above and the pattern has one shape to accept.
	...(cookieDomain ? { COOKIE_DOMAIN: cookieDomain } : {}),
});

if (result instanceof type.errors) {
	throw new Error(
		`Invalid environment:\n${result.summary}\n\nDid you copy .env.example to .env?`,
	);
}

export const env = result;
export type Env = typeof env;
