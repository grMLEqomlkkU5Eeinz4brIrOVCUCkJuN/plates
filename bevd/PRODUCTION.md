# Before you ship this

The templates leave out rate limiting, TLS, metrics and the rest of this list. Most of it
your proxy, gateway or platform may already do; check that before adding it to the app.

## Usually handled outside the app

If nothing in front of the app does these, they are yours.

- Rate limiting on `auth.login` and `auth.register`. There is none. Do this first. The
  constant-time login path stops email enumeration, not credential stuffing. If you add
  the limiter in the app, it has to cover `AuthService/Login` over gRPC as well as tRPC:
  both reach the same service function.
- TLS termination. The app speaks plain HTTP.
- gRPC transport security. `startGrpcServer` binds with
  `grpc.ServerCredentials.createInsecure()`. Fine behind a mesh with mTLS, wrong on
  anything routable.
- Response security headers (HSTS, `X-Content-Type-Options`, frame options).
- Secret delivery. `.env` is for development. In production `JWT_SECRET` should come from
  your platform's secret store, so rotating it does not need a rebuild.
- Request timeouts and body size limits, if your proxy does not set them.

## Only the app can do these

- Refresh token reuse detection. `auth.service.ts` rotates tokens but does not detect
  reuse. Today a stolen token gets used once, the real user's next refresh is rejected,
  and nothing notices. The hook is in the transaction: a presented token that is found
  but already revoked means theft. Revoke all of that user's tokens and alert someone.
- Prune `refresh_tokens`. Rows get `revokedAt` and are never deleted. Periodically delete
  rows that are revoked or past `expiresAt`; the `tokenHash` index slows down long before
  disk runs out.
- Pool settings. `createDatabase` is `new Pool({ connectionString })`: default max
  connections, no idle timeout, no statement timeout. Set `max` against your database's
  connection limit and set a statement timeout so one bad query cannot hold a connection.
- Password reset and email verification. `register` accepts any well-formed address and
  never checks it. A user who mistypes their email has no way back in.
- MFA. Decide before the user table is large; adding it later is a migration and a UX
  change.

## Decide before the first deploy

- The OpenAPI UI (`/docs`, `/docs.json`) is enabled whenever `NODE_ENV` is not
  `production`. Turn it on in production only if you want the API published.
- `/health` does not touch the database. It returns `uptime` and always answers, so use it
  as the liveness probe. For readiness use the tRPC `health.db` procedure, which runs
  `select 1`. A readiness probe on `/health` reports healthy while every request fails.
- Observability stops at logs: structured NDJSON with a request id through both
  transports. An inbound `x-request-id` is reused, so the id crosses service boundaries.
  There are no metrics and no spans.
- Check the redaction list in `lib/logger.ts` against any fields you add. `pino` only
  redacts the paths listed there. The existing code logs user ids, not emails; keep it
  that way.
- `CORS_ORIGIN` takes a single origin. More than one frontend means changing it to a
  list, and `credentials: true` rules out `*`.
- Set `COOKIE_DOMAIN` if the app and the API are on different hostnames. Unset, every
  cookie is host-only: only the host that set it gets it back, which is right on localhost
  and behind one hostname. With the Vue app on `app.example.com` and the API on
  `api.example.com`, the session cookies land on a host the page is not on. In
  `base-lacewing` the page also cannot read the `csrf_token` cookie it has to echo back as
  a header, so every mutation fails CSRF and the error says nothing about cookies.
  `COOKIE_DOMAIN=example.com` scopes the cookies, `csrf_token` included, to the parent and
  so to every subdomain under it, including ones you do not run. It only works under one
  registrable domain. To serve the app from a different domain, put both behind one
  origin. `base-jwt` also accepts `COOKIE_SAME_SITE=none` (with `COOKIE_SECURE=true`);
  `base-lacewing` refuses it.

## Watch these as the code grows

- Services receive the transport's context object. A tRPC `Context` extends `ServiceCtx`,
  so a resolver passes itself in and the service's parameter type hides `req` and
  `resHeaders`. The object still carries them at runtime, so one `as any` or one
  `log.info({ ctx })` leaks transport state. If that becomes a problem, destructure at the
  call site.
- `auth/policy.ts` is imported by the browser as runtime code, so `canMutate` exists once.
  It imports nothing but a type today. If someone adds an import that reaches Drizzle or
  `node:crypto`, the frontend bundle breaks in a way that is hard to trace. Add a lint
  rule if the file grows.

## Tests

The suites run against PGlite (Postgres in-process, using the same `drizzle/` migrations
as production), plus a real gRPC server on a real port called with real signed tokens.

CI also boots the server and curls `/health`, because the tests import `src/` directly
and never start a process. That step catches every test passing, the build exiting 0, and
the image dying on its first line because a native addon could not resolve. Keep it.

Not covered: the frontend tests are thin, and nothing here has been run against a real
Postgres server, only PGlite. Same dialect and migrations, but connection handling,
timeouts and concurrency are what PGlite cannot tell you about.
