# bevd/base-jwt

[`bevd/base`](../base) plus JWT authentication and role-based authorization. Everything
in the base README applies; this one covers what auth adds.

## Run it

```sh
bun install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
openssl rand -base64 48   # paste into backend/.env as JWT_SECRET (32+ characters or it will not start)
bun run db:up && bun run db:push
bun run db:seed           # alice@example.com (admin) and bob@example.com, both password123
bun run dev
```

Sign in as each: Bob sees his own draft and can edit only his own posts; Alice sees
everything, can moderate any post, and gets the admin panel.

## Delete first

The seeded users and their `password123`, and the `post` example resource once you have
your own.

## Sessions

- Access token: a JWT (HS256), 15 minutes, carrying `sub`, `email` and `role`.
- Refresh token: not a JWT. 32 random bytes, stored as a SHA-256 hash in
  `refresh_tokens`, so logout revokes it and `revokeAllSessions` ends every session.
  Refreshing rotates it, so a stolen one works once at most.
- Both live in httpOnly cookies. The Vue app holds no token and sends no `Authorization`
  header; it asks `auth.me` who it is. Non-browser callers (curl, another service, gRPC)
  send `Authorization: Bearer <jwt>`, and `http/actor.ts` accepts either.

## Authorization

Three procedure types, in `trpc/trpc.ts`:

```ts
publicProcedure     // anyone; ctx.actor may be null
protectedProcedure  // signed in; ctx.actor is narrowed to Actor (not | null)
adminProcedure      // role === "admin"
```

The procedure types reject early with a clean error, but the rules live in the services
(`auth/actor.ts`, `services/*.service.ts`), because gRPC never goes through a tRPC
procedure. A guard on the router alone would leave gRPC unprotected.

| Resource | Rule |
| --- | --- |
| `post.list` / `post.byId` | Anonymous sees published. Signed in also sees their own drafts. Admin sees all. |
| `post.create` | Any signed-in user. Authorship comes from the token, never the request body. |
| `post.update` / `post.delete` | The author or an admin. |
| `user.*` | Admin only. |

- Someone else's draft is `NOT_FOUND`, not `FORBIDDEN`, so its existence does not leak.
- Changing a role revokes that user's sessions. The old access token still says
  `role: "user"` until it expires, but it cannot be renewed, so a demotion applies within
  one access-token lifetime.
- The last admin cannot demote or delete themselves.

## REST and OpenAPI

Seven REST routes under `/api/v1` mirror the core tRPC procedures. Each calls the same
service function with the same arktype schema and returns the same body:

| Route | Mirrors | Who |
| --- | --- | --- |
| `POST /api/v1/auth/login` | `auth.login` | anyone; sets both cookies |
| `POST /api/v1/auth/refresh` | `auth.refresh` | the `refresh_token` cookie |
| `POST /api/v1/auth/logout` | `auth.logout` | anyone; revokes the refresh token, clears both cookies |
| `GET /api/v1/auth/me` | `auth.me` | signed in |
| `GET /api/v1/posts?limit=&publishedOnly=` | `post.list` | anyone; a session adds your drafts |
| `GET /api/v1/posts/:id` | `post.byId` | anyone; someone else's draft is 404 |
| `POST /api/v1/posts` | `post.create` | signed in; answers 201 |

Everything else is RPC-only and the document says so: `auth.register`, `post.update`,
`post.delete`, the admin `user.*` procedures, `health.ping` and `health.db`. To add a REST
twin: a route in `src/rest/`, an entry in `src/openapi/paths/`, remove its name from
`RPC_ONLY_PROCEDURES`, then `bun run --cwd backend openapi`.

Errors are `{ "error": { "code", "message", "requestId" } }` with the status tRPC sends
for the same code. A route that needs a session rejects an anonymous caller before
reading the body. Logout takes no body but answers 415 unless sent as
`application/json`, as the tRPC procedure does: a cross-site form cannot set that without
a CORS preflight.

The document is OpenAPI 3.1, built from `src/openapi/`, and served outside production at
`/docs` (JSON at `/docs.json`). `bun run --cwd backend openapi` rewrites the committed
`backend/openapi.json` and needs no `.env`, because the input schemas live in
`src/models/` and nothing it imports reads the environment. The tests check every route
is described, the schemas match the ones the routes validate with, the access levels
match what the server refuses, every REST response matches its schema, and the committed
file matches the generator.

## gRPC with auth

No cookies. Log in, take the tokens from the response body, and send the access token as
metadata:

```ts
const metadata = new grpc.Metadata();
metadata.set("authorization", `Bearer ${accessToken}`);

client.CreatePost({ title: "Hi", body: "there" }, metadata, callback);
```

| Situation | gRPC status |
| --- | --- |
| No token / bad token | `UNAUTHENTICATED` |
| Signed in, not an admin, calling `UserService` | `PERMISSION_DENIED` |
| Editing someone else's post | `PERMISSION_DENIED` |
| Empty title | `INVALID_ARGUMENT` |

Protos: `proto/auth.proto` (sessions), `proto/user.proto` (admin only),
`proto/post.proto`.

## Tests

`bun run test`. The backend tests cover the authorization rules: ownership, admin
override, draft visibility, privilege escalation, token rotation and replay,
self-demotion. They run on PGlite, and the gRPC tests use a real client with signed tokens
over a real port.

## Not included

- CSRF tokens. Cookie auth with `SameSite=lax` and a CORS allowlist covers tRPC, because
  every mutation is a JSON `POST` and so is preflighted. If you add cookie-authenticated
  form posts or relax `SameSite`, you need CSRF tokens; [`base-lacewing`](../base-lacewing)
  has them. A host under `COOKIE_DOMAIN` setting its own `access_token` cookie is a
  separate attack; `readCookies` drops any cookie name that arrives twice.
- Rate limiting on login. Add it before you ship.
- Email verification and password reset. Both need a mailer.
- `Bun.password`. It only exists under Bun and Vitest runs under Node, so
  `auth/password.ts` uses `@node-rs/argon2` (argon2id, runs under both).

## Environment

Beyond the base template's variables:

| Variable | Notes |
| --- | --- |
| `JWT_SECRET` | 32+ characters, or the app will not start. |
| `JWT_ACCESS_EXPIRY` | Default `15m`. Cannot be revoked early, so keep it short. |
| `REFRESH_TOKEN_TTL_DAYS` | Default `7`. Revocable. |
| `COOKIE_SECURE` | `true` in production. Over plain http a Secure cookie is silently dropped. |
| `COOKIE_SAME_SITE` | `lax` by default. `none` requires `Secure` and means CSRF is your problem. |
| `COOKIE_DOMAIN` | Unset, every cookie is host-only. Set it when the app and the API are on different hosts; see [PRODUCTION.md](../PRODUCTION.md). |

Before the first deploy, read [`../PRODUCTION.md`](../PRODUCTION.md).
