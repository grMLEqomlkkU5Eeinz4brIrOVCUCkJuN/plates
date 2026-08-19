# bevd/base-jwt

[`bevd/base`](../base) - Bun + Elysia + Vue + Drizzle, with REST, tRPC and gRPC - plus
**JWT authentication and role-based authorization**.

Everything in the base template applies here. This README covers only what auth adds.

## Run it

```sh
bun install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# The app refuses to start without a real signing key:
#   JWT_SECRET must be at least 32 characters.
openssl rand -base64 48   # paste into backend/.env

bun run db:up
bun run db:push
bun run db:seed   # alice@example.com (admin) and bob@example.com - both password123

bun run dev
```

Sign in as each and watch the UI change: Bob sees his own draft and can edit only his own
posts; Alice sees everything, can moderate anyone's post, and gets the admin panel.

## How a session works

| | |
| --- | --- |
| **Access token** | A JWT (HS256), 15 minutes, carries `sub`, `email` and `role`. |
| **Refresh token** | *Not* a JWT. 32 random bytes, stored as a SHA-256 hash. |
| **Where they live** | httpOnly cookies. The Vue app never holds a token. |

Two deliberate departures from the usual recipe:

**The refresh token is opaque, not signed.** A signed refresh JWT cannot be taken back -
it stays valid until it expires, so "log out" is a lie you tell the client. Here each one
is a row (`refresh_tokens`), so logout revokes it for real, and `revokeAllSessions` can
end every session at once. Only the hash is stored: a leaked database hands over nothing
usable. Refreshing **rotates** the token, so a stolen one is good for a single use at most.

**The browser never sees a token.** They go into httpOnly cookies, which script cannot
read - so an XSS bug cannot walk off with the session. The Vue app has no `localStorage`
token and no `Authorization` header; it just asks `auth.me` who it is. Non-browser callers
(curl, another service, gRPC) send `Authorization: Bearer <jwt>` instead, and
`trpc/context.ts` accepts either.

## Authorization

Three procedure types, in `trpc/trpc.ts`:

```ts
publicProcedure     // anyone; ctx.actor may be null
protectedProcedure  // signed in; ctx.actor is narrowed to Actor (not | null)
adminProcedure      // role === "admin"
```

But **the procedure wrapper is not the security boundary.** The rules live in the
services (`auth/actor.ts`, `services/*.service.ts`), because gRPC never passes through a
tRPC procedure. A guard bolted onto the router alone would leave the gRPC door wide open.
The transports reject early for a clean error; the service is what makes the rule true.

What the rules actually are:

| Resource | Rule |
| --- | --- |
| `post.list` / `post.byId` | Public sees published. Signed in also sees **their own drafts**. Admin sees all. |
| `post.create` | Any signed-in user. **Authorship comes from the token**, never the request body. |
| `post.update` / `post.delete` | The author, **or** an admin. |
| `user.*` | Admin only. |

Two details worth stealing:

- **Someone else's draft is `NOT_FOUND`, not `FORBIDDEN`.** `FORBIDDEN` would confirm the
  post exists, which is itself a leak.
- **Changing a role revokes that user's sessions.** Their old access token still says
  `role: "user"` until it expires; dropping the refresh tokens means it cannot be renewed,
  so a demotion takes hold within one token lifetime instead of lingering for a week.

The admin API also refuses to let the last admin demote or delete themselves - otherwise
the system locks itself out with no way back in through the app.

## gRPC with auth

Same services, different envelope. No cookies - log in, get the tokens in the response
body, and send the access token as metadata:

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

`proto/auth.proto` (sessions), `proto/user.proto` (admin only), `proto/post.proto`.

## Tests

```sh
bun run test    # 44 backend, 10 frontend
```

The backend tests are where the authorization rules are actually pinned down - ownership,
admin override, draft visibility, privilege escalation attempts, token rotation and
replay, self-demotion. They run against PGlite (a real Postgres, in-process), and the gRPC
tests use a real client with real signed tokens over a real port.

## What is deliberately not here

- **CSRF tokens.** Cookie auth plus `SameSite=lax` plus a CORS allowlist covers the tRPC
  surface, because every mutation is a `POST` with `content-type: application/json`, which
  is not a "simple request" and so is preflighted. If you add cookie-authenticated form
  posts or relax `SameSite`, you need CSRF tokens - see `csrf-csrf` in the Express
  template. Note that this argument is about forged *requests*; a host under
  `COOKIE_DOMAIN` writing an `access_token` cookie of its own is a different attack, and
  `readCookies` answers it by dropping any name that arrives twice.
- **Rate limiting** on login. Add it before you ship; brute force is the obvious attack on
  the one endpoint that accepts passwords.
- **Email verification and password reset.** Both need a mailer, which is a choice this
  template should not make for you.
- **`Bun.password`.** It is the same argon2id, but it only exists under Bun, and Vitest
  runs its workers under Node - every test that imports it would break. `@node-rs/argon2`
  (what `auth/password.ts` uses) produces the same kind of hash and runs under both.

## Environment

Beyond the base template's variables:

| Variable | Notes |
| --- | --- |
| `JWT_SECRET` | >= 32 characters, or the app will not start. |
| `JWT_ACCESS_EXPIRY` | Default `15m`. Cannot be revoked early - keep it short. |
| `REFRESH_TOKEN_TTL_DAYS` | Default `7`. Revocable, so it can be generous. |
| `COOKIE_SECURE` | **`true` in production.** Over plain http a Secure cookie is silently dropped. |
| `COOKIE_SAME_SITE` | `lax` by default. `none` requires `Secure` and means CSRF is your problem. |
| `COOKIE_DOMAIN` | Unset leaves every cookie host-only. Set the shared parent (`example.com`) once the app and the API sit on different hosts, or the frontend host never receives what the API set and a login that returned 200 is followed by requests with no session on them. A `Domain` cookie goes to every subdomain underneath, so pick the narrowest parent that covers your hosts. |
