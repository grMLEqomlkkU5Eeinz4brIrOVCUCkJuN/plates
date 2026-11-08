# express-ts/base-backend-jwt-prisma

[`base-backend-jwt`](../base-backend-jwt) with a real login: accounts in Postgres through
[Prisma](https://www.prisma.io) 7, argon2id passwords, a short-lived JWT in an httpOnly
cookie, opaque rotated refresh tokens with reuse detection, double-submit CSRF, a request
id, rate limiting and a readiness probe.

## Run it

```bash
npm install                  # also generates the Prisma client and installs the git hooks
docker compose up -d db      # Postgres 17 on 5432, plus a jwt_prisma_backend_test database
npm run db:migrate           # applies prisma/migrations, regenerates the client
npm run dev                  # loads the committed .env.development
```

Node 24 (`.nvmrc`). `.env.development` has throwaway values. For production,
`cp .env.production.example .env.production` and fill it in; `npm start` loads that file
and `NODE_ENV=production npm run db:deploy` migrates against it. The server refuses to
boot on a missing or short secret, and the error names every wrong variable at once.

`npm test` needs Postgres too: the route suites run against the test database (migrate it
with `NODE_ENV=test npm run db:deploy`), nothing in the request path is mocked, and tables
are truncated between tests.

## Layout

```text
routes/         which middleware runs, in what order, in front of which handler
controllers/    read the parsed request, call one service, write the response
services/       the logic, and the only place `prisma` is imported
models/         zod schemas for what a client may send; projections for what it may see
middleware/     request id, validation, authentication, CSRF, rate limit, errors
db/prisma.ts    the PrismaClient, pool settings, readiness ping, and the two driver errors
```

Only `src/services` calls Prisma. A controller or middleware that needs a row asks a
service. `db/prisma.ts` is imported by the services, by `main.ts` (ping at boot, close the
pool at shutdown), by the readiness probe through `pingDatabase`, and by the test fixture
that truncates tables. That way you can see everything the app does to the database
without reading every route.

`middleware/auth.ts` verifies the cookie and reads nothing; `services/user.service.ts`
reads the row and decides. Controllers are a few lines; `auth.service.ts` is long because
refresh-token rotation is where the decisions are.

## Errors

One shape everywhere:

```json
{ "success": false, "code": "INVALID_CREDENTIALS", "message": "...", "requestId": "..." }
```

Branch on `code`; the list is `ErrorCode` in `src/models/error.model.ts`. `requestId` is
echoed in the `X-Request-Id` header and appears in every log line for that request; an
inbound `X-Request-Id` is kept if it is short and printable. Validation failures carry
`details`, one `{ field, message }` per problem.

Every body schema is a strict object, so an unknown field gets a 400. A caller cannot add
`passwordHash` to a profile edit and hope something binds it.

## Sessions

`POST /auth/register` creates the account and opens a session; `POST /auth/login` opens
one for an existing account. Both set two httpOnly cookies and return a CSRF token in the
body:

| Cookie | Holds | Path | Lifetime |
| --- | --- | --- | --- |
| `access_token` | HS256 JWT: `sub` (user id), `sid` (session) | `/` | `JWT_ACCESS_EXPIRY`, 15 minutes |
| `refresh_token` | 256 random bits, stored as a SHA-256 hash | `/api/v1/auth/refresh` | `REFRESH_TOKEN_EXPIRY`, sliding |

- Access tokens are never checked against the database, so an authenticated request
  makes no query. That is why the lifetime is short: logout and account deletion apply
  to the access token when it expires, and to refresh immediately.
- Refresh tokens are single use. `POST /auth/refresh` spends the one in the cookie with a
  conditional update (`WHERE used_at IS NULL`), so two requests with the same token
  cannot both pass, and issues the next one in the same family. A spent token revokes the
  whole family and answers `REFRESH_REUSED`: a real client that lost a response signs in
  again, and a thief's chain dies with the victim's. `POST /auth/logout` revokes the
  family the access token names, since the refresh cookie's path never reaches it.
- Every mutation needs the CSRF token in `x-csrf-token`. It is HMAC'd against the access
  cookie (`middleware/csrf.ts`), so it is bound to one session; `GET /auth/csrf-token`
  issues a fresh one after a page reload. `POST /auth/refresh` needs it too, since the
  refresh cookie rides along on a cross-site POST. The access cookie's Max-Age is the
  refresh lifetime, so the browser keeps sending it after the JWT expires and the CSRF
  token still checks out.
- A login for an unknown address takes as long as one for a known address
  (`equalisePasswordTiming`) and answers the same message. Register, login, refresh and
  account deletion are rate limited per address and per email.

## Accounts

`/users/me` acts on the caller's own row, taken from the token: `GET` returns it, `PATCH`
changes name or email, `DELETE` closes it and requires the current password. There is no
`PATCH /users/:id`; an administrator is a role with its own router.

`GET /users` is an offset-paginated directory answering `{ items, total, limit, offset }`
(`limit` defaults to 20, capped at 100), and `GET /users/:id` one entry of it. Both return
the public projection: id, name, join date. No email. A row leaves the process only
through `toAccount` or `toPublicUser` in `models/user.model.ts`, which keeps
`passwordHash` in.

## Database

| File | Owns |
| --- | --- |
| `prisma/schema.prisma` | `users`, `refresh_tokens` and the cascade between them. |
| `prisma.config.ts` | The connection. Prisma 7 reads no `.env` file itself; this loads `.env.<NODE_ENV>` with Node's loader, so the CLI and the app use the same database. |
| `prisma/migrations/` | One folder of SQL per change, committed. CI applies them to an empty Postgres and diffs the result against the schema. |
| `src/generated/prisma/` | The generated client. Gitignored; `npm install` and `npm run db:migrate` regenerate it. |
| `src/db/prisma.ts` | The `PrismaClient`, the pool, `pingDatabase`, `disconnectDatabase`, and the two driver errors (`P2002`, `P2025`) a service may translate. |

The pool is node-postgres' through `@prisma/adapter-pg`, and every setting is in
`config/env.ts` with the failure it prevents. `DATABASE_POOL_MAX` is per process: replicas
times that, plus someone in `psql`, has to stay under Postgres' `max_connections`.

`npm run db:deploy` applies committed migrations and creates nothing. Run it as a release
step before the new version serves. Neither the app nor the Dockerfile migrates on boot,
so two replicas never race to migrate.

## Health

`GET /health` is liveness and checks only the process, because restarting the app does
not fix a database. `GET /health/ready` pings Postgres with a two-second budget and
answers 503 `DEPENDENCY_UNAVAILABLE` if it fails; point the Dockerfile's `HEALTHCHECK`
and any load balancer at that one.

Outside production `/docs` serves Swagger UI. Routes are described in
`src/openapi/paths/` with the same zod schemas `validate()` runs; after changing one, `npm
run openapi` rewrites `openapi.json`. The suite fails if a route is undescribed, a
description names a different schema, a response does not match, or `openapi.json` is
stale.

## Things that will bite you

- The rate limiter counts per process. Two replicas means two limits, and a restart
  clears them. It stops a single box hammering `/auth/login`; back it with Redis for
  more.
- `TRUST_PROXY` decides what `req.ip` is, and the rate limiter keys on `req.ip`, as does
  the CSRF session for anonymous callers. Behind a proxy with it left at `false`,
  everyone shares one address and one bucket. Set to `true`, anyone can forge one;
  `config/env.ts` refuses that in production.
- Closing an account or logging out leaves the access token valid for up to
  `JWT_ACCESS_EXPIRY`. `GET /users/me` answers 401 as soon as the row is gone, because it
  reads the row; a handler that only runs `authenticate` does not. If a path cannot
  tolerate that, read the row.
- The suite truncates `users`. `.env.test` points at `jwt_prisma_backend_test`, which
  `docker compose` creates from `scripts/create-test-database.sql` on a fresh volume
  only. Point `DATABASE_URL` at a database you care about and `npm test` empties it.
- `npm install` on npm 12 asks about install scripts. `package.json` carries an
  `allowScripts` block naming the six packages that need them (argon2's prebuilt binary,
  Prisma's engines, esbuild, lefthook). Bump one of those versions and re-approve it, or
  the install warns and the binary is missing at runtime.
- The logger writes rotating files to `LOG_DIR`. In the image that is `/app/logs`, an
  ephemeral layer nobody collects. Drop the file transports in `utils/logger.ts` when you
  containerise, and the `mkdir` in the Dockerfile with them.
- Secrets are redacted by key name (`password`, `token`, `secret`, `cookie`, `csrf`, ...)
  on the way into the logger. Name a field something else and it is logged.
- Refresh sessions slide. Each refresh grants another `REFRESH_TOKEN_EXPIRY`, so a
  session in daily use never ends. For an absolute lifetime, carry the family's original
  expiry on each new row instead of calling `refreshExpiry()`.
- `GET /users` is readable by any signed-in account. It shows names and join dates only;
  if that is too much, delete the two routes. Nothing else depends on them.

For cookie scope across hosts (`COOKIE_DOMAIN`) and the rest of the pre-deploy list, read
[`../PRODUCTION.md`](../PRODUCTION.md).
