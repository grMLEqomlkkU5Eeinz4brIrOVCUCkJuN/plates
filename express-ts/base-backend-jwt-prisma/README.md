# Express + TypeScript + Prisma (JWT cookies, CSRF)

One Express 5 service with a real datastore behind it: accounts in Postgres
through [Prisma](https://www.prisma.io) 7, argon2id passwords, a short-lived
JWT in an httpOnly cookie, opaque rotated refresh tokens with reuse detection,
double-submit CSRF, and the operational pieces a service needs before it is
left running unattended. It is [`base-backend-jwt`](../base-backend-jwt) with
the placeholder login replaced by one that authenticates somebody.

## Running it

```bash
npm install                  # also generates the Prisma client and installs the git hooks
docker compose up -d db      # Postgres 17 on 5432, plus a jwt_prisma_backend_test database
npm run db:migrate           # applies prisma/migrations, regenerates the client
npm run dev                  # watch mode; loads the committed .env.development
```

`.env.development` is committed with throwaway values, so the four lines above
are the whole setup. For anything real, `cp .env.production.example
.env.production` and fill it in; `npm start` loads that file, and
`NODE_ENV=production npm run db:deploy` migrates against it. The server refuses
to boot on a missing or short secret rather than defaulting, and the error
names every variable that is wrong in one pass.

`npm test` needs Postgres too: every route suite runs against the test
database, migrated by `NODE_ENV=test npm run db:deploy`. Nothing in the request
path is mocked. The suite truncates tables between tests, which is why it has
a database of its own.

## The rule this template exists to show

```text
routes/         which middleware runs, in what order, in front of which handler
controllers/    read the parsed request, call one service, write the response
services/       the logic, and the only place `prisma` is imported
models/         zod schemas for what a client may send; projections for what it may see
middleware/     request id, validation, authentication, CSRF, rate limit, errors
db/prisma.ts    the one PrismaClient, the pool settings, the readiness ping,
                and the two driver errors a service is allowed to recognise
```

**Only `src/services` calls Prisma.** A controller that needs a row asks a
service; a middleware that needs one does the same. `db/prisma.ts` is imported
by the services, by `main.ts` (to ping at boot and close the pool at
shutdown), by the readiness probe (through `pingDatabase`, not a query) and by
the test fixture that truncates between tests, and by nothing else. The rule
exists because a query written into a request handler is the first of many,
and six months later nobody can say what the application does to the database
without reading every route.

The layers are asymmetric. `middleware/auth.ts` verifies the cookie
and reads nothing; `services/user.service.ts` reads the row and decides. A
controller is three lines because it has nothing to decide; `auth.service.ts`
is long because refresh-token rotation is where the decisions are.

## The request contract

Errors are one shape everywhere:

```json
{ "success": false, "code": "INVALID_CREDENTIALS", "message": "...", "requestId": "..." }
```

`code` is the stable value to branch on; the list is `ErrorCode` in
`src/middleware/errorHandler.ts`, and adding a case there is how a new failure
becomes part of the contract. `requestId` is echoed in the `X-Request-Id`
header and appears in every log line for that request; an inbound
`X-Request-Id` is kept if it is short and printable. Validation failures carry
`details`, one `{ field, message }` per problem.

Every body schema is a strict object, so an unknown field answers 400. That is
what stops a caller adding `passwordHash` to a profile edit and hoping
something binds it.

## Signing in

`POST /auth/register` creates the account and opens a session in one step;
`POST /auth/login` opens one for an existing account. Both set two httpOnly
cookies and return a CSRF token in the body:

| Cookie | Holds | Path | Lifetime |
| --- | --- | --- | --- |
| `access_token` | HS256 JWT: `sub` (user id), `sid` (session) | `/` | `JWT_ACCESS_EXPIRY`, 15 minutes |
| `refresh_token` | 256 random bits, stored as a SHA-256 hash | `/api/v1/auth/refresh` | `REFRESH_TOKEN_EXPIRY`, sliding |

**An access token is never checked against the database.** That is what keeps
an authenticated request free of a query, and it is why the lifetime is short:
logout and account deletion take effect for the access token when it expires,
and for everything that refreshes, immediately.

**Refresh tokens are single use.** `POST /auth/refresh` spends the one in the
cookie with a conditional update (`WHERE used_at IS NULL`), so two requests
carrying the same token cannot both pass, and issues the next one in the same
family. Presenting a spent token revokes the whole family and answers
`REFRESH_REUSED`: an honest client that lost a response signs in again, and a
thief's chain dies with the victim's. `POST /auth/logout` revokes the family
the access token names, which is how it works without the refresh cookie,
whose path never reaches it.

Every mutation needs the CSRF token back in `x-csrf-token`. The token is
HMAC'd against the access cookie (`middleware/csrf.ts`), so it is bound to one
session; `GET /auth/csrf-token` issues a fresh one after a page reload.

A login against an unknown address costs the same as one against a known
address (`equalisePasswordTiming`), and answers the same message, so neither
the timing nor the text enumerates the user base. Register, login, refresh and
account deletion are rate limited per address and per email; the limiter
counts in the process, see below.

## Accounts

Everything under `/users/me` acts on the caller's own row, taken from the
token: `GET` returns it, `PATCH` changes name or email, `DELETE` closes it
and takes the current password to do so. There is no `PATCH /users/:id`,
because an ownership check that is written down anywhere can be forgotten
somewhere; if you need an administrator, that is a role and its own router.

`GET /users` is a cursor-paginated directory (`limit` capped at 100 on the
server, `cursor` the id of the last row seen) and `GET /users/:id` one entry
of it. Both answer the public projection: id, name, when they joined. The
email is a login identifier and does not appear.

A row leaves the process through `toAccount` or `toPublicUser` in
`models/user.model.ts` and through nothing else, which is how `passwordHash`
stays inside.

## The database

| File | Owns |
| --- | --- |
| `prisma/schema.prisma` | The shape: `users`, `refresh_tokens`, the cascade between them. |
| `prisma.config.ts` | The connection. Prisma 7 keeps the URL out of the schema and reads no `.env` file by itself; this loads `.env.<NODE_ENV>` through Node's own loader, so the CLI and the app cannot disagree about which database they mean. |
| `prisma/migrations/` | The history. One folder of SQL per change, committed. CI applies them to an empty Postgres and diffs the result against the schema. |
| `src/generated/prisma/` | The client `prisma generate` writes. **Gitignored**; `npm install` and `npm run db:migrate` regenerate it. |
| `src/db/prisma.ts` | The single `PrismaClient`, the pool, `pingDatabase`, `disconnectDatabase`, and the two driver errors (`P2002`, `P2025`) a service may translate. |

The pool is node-postgres', through `@prisma/adapter-pg`, and every setting on
it is named in `config/env.ts` with the failure it prevents. `DATABASE_POOL_MAX`
is per process: replicas times that number, plus a human with `psql`, has to
stay under Postgres' `max_connections`.

`npm run db:deploy` is the production counterpart of `db:migrate`: it applies
committed migrations and creates nothing new. Run it as its own release step,
before the new version starts serving. The app does not migrate on boot, and
neither does the Dockerfile; two replicas racing to migrate the same database
is a worse problem than an extra deploy stage.

## Health

`GET /health` is liveness and checks nothing but the process, because the
answer decides whether the container is restarted and restarting the app does
not fix a database. `GET /health/ready` pings Postgres with a two-second
budget and answers 503 `DEPENDENCY_UNAVAILABLE` when it does not answer; the
Dockerfile's `HEALTHCHECK` and any load balancer should point at that one.

## Scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Watch mode; loads `.env.development`. |
| `npm run build` / `npm start` | Compile to `dist/`; run it with `.env.production`. |
| `npm test` | Jest, serially, against the test database. |
| `npm run db:migrate` | Create and apply a migration from a schema edit (development). |
| `npm run db:deploy` | Apply committed migrations (CI, production). |
| `npm run db:studio` | Prisma's table browser. |
| `npm run typecheck` / `npm run lint` | Type-check everything, tests included; ESLint. |

Requires Node 24 (see `.nvmrc`). `/docs` serves Swagger UI outside production.

## Things that will bite you

- **The rate limiter counts per process.** Two replicas means two limits, and
  a restart clears them. It is real protection against a single box hammering
  `/auth/login`; it is not a control until it is backed by Redis.
- **`TRUST_PROXY` decides what `req.ip` is**, and the rate limiter keys on
  `req.ip`, as does the CSRF session for anonymous callers. Behind a proxy with
  it left at `false`, everyone shares one address and one bucket. Set to
  `true`, anyone can forge one; `config/env.ts` refuses that in production.
- **Closing an account or logging out leaves the access token valid until it
  expires.** Up to `JWT_ACCESS_EXPIRY`. `GET /users/me` answers 401 the moment
  the row is gone, because it reads the row; a handler that only runs
  `authenticate` does not. If a path cannot tolerate that window, read the row.
- **The suite truncates `users`.** `.env.test` points at
  `jwt_prisma_backend_test`, which `docker compose` creates from
  `scripts/create-test-database.sql` on a fresh volume only. Point
  `DATABASE_URL` at a database you care about and `npm test` empties it.
- **`npm install` on npm 12 asks about install scripts.** `package.json`
  carries an `allowScripts` block naming the six packages that need them
  (argon2's prebuilt binary, Prisma's engines, esbuild, lefthook). Bump one of
  those versions and re-approve it, or the install warns and the binary is
  missing at runtime.
- **The logger writes rotating files to `LOG_DIR`.** Inside the image that is
  `/app/logs`, an ephemeral layer nobody collects. The console transport is
  already there; drop the file transports in `utils/logger.ts` when you
  containerise, and the `mkdir` in the Dockerfile with them.
- **Secrets are redacted by key name** (`password`, `token`, `secret`,
  `cookie`, `csrf`, ...) on the way into the logger, not by remembering. Name a
  field something else and it is logged.
- **Refresh sessions slide.** Each refresh grants another
  `REFRESH_TOKEN_EXPIRY`, so a session in daily use never ends on its own. If
  you want an absolute lifetime, carry the family's original expiry on each
  new row instead of `refreshExpiry()`.
- **`GET /users` is readable by any signed-in account.** It shows names and
  join dates only, but if that is more than your product should show, delete
  the two routes; nothing else depends on them.
