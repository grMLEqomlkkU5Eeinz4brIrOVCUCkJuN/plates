import { type } from "arktype";

/**
 * Two RFC 1123 labels or more. A single label ("localhost", a container name)
 * cannot work: a Domain attribute has to be a suffix of the request host, and
 * browsers drop a cookie whose Domain is not.
 */
const CookieDomain = type(/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i).describe(
	'a bare parent domain like "example.com": no scheme, no port, no path, at least two labels (leave COOKIE_DOMAIN unset on localhost or where one host serves everything)',
);

/**
 * No "none": a cross-site token cookie is the thing CSRF exploits. The
 * description names the way out, because a frontend on a different registrable
 * domain is what sends people looking for "none" in the first place.
 */
const SameSite = type("'lax' | 'strict'").describe(
	'"lax" or "strict" (a frontend on a different registrable domain has to reach this API through one shared origin, for instance a reverse proxy mounting /trpc under the app\'s domain)',
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

	// 32 characters is only the first gate. lacewing entropy-checks the secret
	// when it imports the key: a human-chosen passphrase - even a long one -
	// throws EntropyCheckFailed and the app refuses to boot. Generate one with
	//   openssl rand -base64 48
	JWT_SECRET: "string >= 32",
	// Anything lacewing's duration parser accepts: "15m", "1h". Capped at 1h -
	// access tokens above that refuse to sign, and that cap is the point.
	JWT_ACCESS_EXPIRY: "string > 0",
	// `iss`/`aud` are pinned at verification; a token minted for another
	// deployment fails here regardless of its signature.
	JWT_ISSUER: "string > 0",
	JWT_AUDIENCE: "string > 0",
	REFRESH_TOKEN_TTL_DAYS: "1 <= number <= 365",

	// No COOKIE_SECURE switch: every cookie this app sets is Secure,
	// unconditionally (lacewing will not emit anything weaker, and the CSRF
	// cookie matches it). http://localhost counts as a secure context, so dev
	// works; anything non-local must be https. "none" is likewise not an
	// option - cross-site token cookies are how CSRF happens.
	COOKIE_SAME_SITE: SameSite,
	// Unset leaves the cookies host-only: only the host that set them gets them
	// back, which is what localhost and one hostname serving both halves want.
	// Split the app and the API across app.example.com and api.example.com and
	// the CSRF cookie breaks first - http/cookies.ts leaves it readable by
	// script so the page can echo it back as a header, and script on the app
	// host cannot read a cookie the API host scoped to itself, so the header is
	// never sent and every mutation comes back a CSRF failure.
	// COOKIE_DOMAIN=example.com scopes all three cookies to the shared parent,
	// at the price of reaching every subdomain under it - and the CSRF cookie
	// is the one a neighbouring subdomain can read as well.
	"COOKIE_DOMAIN?": CookieDomain,
});

const cookieDomain = (process.env.COOKIE_DOMAIN ?? "").trim().replace(/^\./, "");

// Defaults are applied before validation so the schema stays a plain shape check -
// no morphs, no surprises about whether a default is validated as input or output.
const result = Env({
	NODE_ENV: process.env.NODE_ENV ?? "development",
	PORT: Number(process.env.PORT ?? 3000),
	GRPC_PORT: Number(process.env.GRPC_PORT ?? 50051),
	LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
	SERVICE_NAME: process.env.SERVICE_NAME ?? "bevd-lacewing-backend",
	DATABASE_URL: process.env.DATABASE_URL ?? "",
	CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:5173",
	JWT_SECRET: process.env.JWT_SECRET ?? "",
	JWT_ACCESS_EXPIRY: process.env.JWT_ACCESS_EXPIRY ?? "15m",
	JWT_ISSUER: process.env.JWT_ISSUER ?? "http://localhost:3000",
	JWT_AUDIENCE: process.env.JWT_AUDIENCE ?? "http://localhost:3000/trpc",
	REFRESH_TOKEN_TTL_DAYS: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 7),
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
