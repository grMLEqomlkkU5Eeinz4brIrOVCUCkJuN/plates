# bevd/base-lacewing

[`bevd/base-jwt`](../base-jwt) - Bun + Elysia + Vue + Drizzle with JWT auth and roles -
rebuilt on [lacewing](https://github.com/Smiduweorc/lacewing), plus **double-submit CSRF
protection**. This template is a working demo of what lacewing buys a real full-stack
app: the JWT lifecycle that `lib/jwt.ts` previously had to get right by hand is now
enforced by the library, and the bits lacewing deliberately does not do (opaque refresh
tokens, CSRF) show where it ends and your app begins.

Everything in `base` and `base-jwt` applies here. This README covers what changed.

## Run it

```sh
bun install
cp frontend/.env.example frontend/.env
# backend/.env ships with a dev-only JWT_SECRET so this template runs out of
# the box. For anything real, generate your own:  openssl rand -base64 48
# (lacewing entropy-checks it at boot - a human-chosen passphrase, however
# long, throws EntropyCheckFailed and the app refuses to start.)

bun run db:up
bun run db:push
bun run db:seed   # alice@example.com (admin) and bob@example.com - both password123

bun run dev
```

## What lacewing does here

| Concern | Where | What you get |
| --- | --- | --- |
| One verify path | `lib/jwt.ts` | `jwtVerify(token, profile)` against an `accessTokenProfile`: `typ: at+jwt` (RFC 9068), pinned issuer + audience, HS256 allowlist, 1h lifetime cap, unique `jti` on every token. No decode-without-verify, no `alg: none`, no HMAC/RSA swap. |
| Secret hygiene | `lib/jwt.ts` + boot | `importKey` entropy-checks `JWT_SECRET`. The old `dev-only-secret-...` value from `base-jwt` no longer boots - that is a feature, and the committed dev value is now real random bytes. |
| Cookie transport | `lib/cookies.ts` | The token cookies come from `buildTokenCookie`, where `HttpOnly; Secure; SameSite` are facts, not options. `COOKIE_SECURE` is gone from the env - there is nothing to switch. |
| Bearer transport | `trpc/context.ts`, `grpc/auth.ts` | `parseBearer`: strict RFC 6750, exactly one `Bearer <token>`, exact-case scheme, no query-string tokens - for curl, services, and gRPC metadata. |
| Inspection, loudly | `trpc/routers/__tests__/auth.test.ts` | `unsafeDecode` returns an `UntrustedJwt` the type system refuses wherever a `VerifiedJwt` is required - good for tests and debugging, useless for auth logic. |

**The refresh token is still opaque, on purpose.** `base-jwt`'s argument holds: a
DB-backed random token is revocable for real and rotates on every use. lacewing has JWT
refresh tokens (`newRefreshToken`, `typ: rt+jwt`, a revocation store) for when you want
stateless ones - the Express lacewing template demonstrates that flavour. Here, the
database *is* the revocation store, and there is no reason to pretend otherwise.

## CSRF: the double submit

`base-jwt` relied on `SameSite=lax` plus the CORS allowlist. That holds until someone
relaxes SameSite, adds a form post, or serves an attacker-controllable subdomain - so this
template adds the second lock:

- Every session mints a random token (`lib/csrf.ts`) into `csrf_token` - the **one
  deliberately non-httpOnly cookie**, because the page has to read it.
- The Vue tRPC client (`frontend/src/lib/trpc.ts`) reads that cookie and echoes it as
  `x-csrf-token` on every call.
- The `csrfGuard` middleware (`trpc/trpc.ts`) rejects any **mutation** whose caller was
  authenticated **by cookie** unless header and cookie match (timing-safe).

A cross-site page can make the browser *send* our cookies, but cannot *read* them - so it
can never produce the header. Bearer-authenticated calls are exempt (holding the token is
already proof), which is also why gRPC needs no CSRF story. `app.test.ts` pins this down
over real HTTP: same session, same cookies, no header -> 403.

## How a session works

| | |
| --- | --- |
| **Access token** | A lacewing JWT (`at+jwt`, HS256), 15 minutes, carries `sub`, `email`, `role`. |
| **Refresh token** | *Not* a JWT. 32 random bytes, stored as a SHA-256 hash, rotated on use. |
| **CSRF token** | 32 random bytes in the one readable cookie, echoed back as a header. |
| **Where they live** | httpOnly cookies (tokens) + one readable cookie (CSRF). The Vue app never holds a token. |

## Authorization

Unchanged from `base-jwt`: `publicProcedure` / `protectedProcedure` / `adminProcedure` at
the edge, with the real rules in the services (`lib/actor.ts`) because gRPC never passes
through a tRPC procedure. Ownership, admin override, draft visibility, "someone else's
draft is NOT_FOUND not FORBIDDEN", role changes revoking sessions, last-admin
protection - see [`base-jwt`'s README](../base-jwt) for the full tour; it all applies
verbatim.

## gRPC with auth

Same services, different envelope. No cookies and no CSRF - log in, get the tokens in the
response body, and send the access token as metadata:

```ts
const metadata = new grpc.Metadata();
metadata.set("authorization", `Bearer ${accessToken}`);

client.CreatePost({ title: "Hi", body: "there" }, metadata, callback);
```

The header now goes through lacewing's `parseBearer`, so it is stricter than before:
exactly `Bearer <token>`, exact case, one token. `bearer` or two tokens in one header
resolve to anonymous.

## Tests

```sh
bun run test    # 47 backend, 10 frontend
```

Everything `base-jwt` pinned down (ownership, escalation attempts, rotation, replay,
self-demotion) plus: the CSRF 403 over real HTTP, the readable-vs-httpOnly cookie split,
and the shape lacewing enforces on every access token (`typ`, `iss`, `aud`, `jti`).

## What is deliberately not here

- **Rate limiting** on login. Add it before you ship; brute force is the obvious attack on
  the one endpoint that accepts passwords.
- **Email verification and password reset.** Both need a mailer, which is a choice this
  template should not make for you.
- **JWKS / asymmetric keys.** One service signs and verifies, so an entropy-checked HMAC
  secret is honest. The moment a *second* service must verify these tokens, switch to
  `generateKeyPair()` (EdDSA) and hand the profile a `{ jwksUri }` - lacewing does the
  caching and rotation. HMAC across services would mean every verifier can also mint;
  if you have to do it anyway, [docs/symmetric-jwks.md](../../docs/symmetric-jwks.md)
  covers the safe shapes (and the one that hands out your signing key).
- **`Bun.password`.** Same argon2id, but Bun-only, and Vitest workers run under Node -
  `@node-rs/argon2` produces the same hash and runs under both.

## Environment

Beyond the base template's variables:

| Variable | Notes |
| --- | --- |
| `JWT_SECRET` | >= 32 chars **and** entropy-checked - `openssl rand -base64 48`. Refuses to boot otherwise. |
| `JWT_ACCESS_EXPIRY` | Default `15m`. lacewing caps access tokens at 1h; longer refuses to sign. |
| `JWT_ISSUER` / `JWT_AUDIENCE` | Pinned into and checked against every token. |
| `REFRESH_TOKEN_TTL_DAYS` | Default `7`. Revocable, so it can be generous. |
| `COOKIE_SAME_SITE` | `lax` or `strict`. `none` is not an option, and `COOKIE_SECURE` no longer exists - every cookie is Secure, and `http://localhost` counts as a secure context. |
