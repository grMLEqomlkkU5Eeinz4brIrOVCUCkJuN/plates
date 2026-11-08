# bevd/base-lacewing

[`bevd/base-jwt`](../base-jwt) rebuilt on [lacewing](https://github.com/Smiduweorc/lacewing),
plus double-submit CSRF. The JWT handling that `base-jwt` writes by hand in `auth/jwt.ts`
is done by lacewing; opaque refresh tokens and CSRF stay in the app. Everything in the
`base` and `base-jwt` READMEs applies; this one covers what changed.

## Run it

```sh
bun install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
openssl rand -base64 48   # paste into backend/.env as JWT_SECRET
bun run db:up && bun run db:push
bun run db:seed           # alice@example.com (admin) and bob@example.com, both password123
bun run dev
```

lacewing entropy-checks `JWT_SECRET`: a human-chosen passphrase, however long, throws
`EntropyCheckFailed` and the app does not start. The key is imported on the first sign or
verify, not at import time, so the failure shows up there.

## What lacewing does here

- `auth/jwt.ts`: one verify path, `jwtVerify(token, profile)` against an
  `accessTokenProfile`. `typ: at+jwt` (RFC 9068), pinned issuer and audience, HS256 only,
  a 1h lifetime cap, a unique `jti` on every token. No decode-without-verify, no
  `alg: none`, no HMAC/RSA swap.
- `http/cookies.ts`: token cookies come from `buildTokenCookie`, always
  `HttpOnly; Secure; SameSite`. There is no `COOKIE_SECURE` variable.
- `trpc/context.ts`, `grpc/metadata.ts`: `parseBearer`, strict RFC 6750. Exactly one
  `Bearer <token>`, exact-case scheme, no query-string tokens. `bearer` or two tokens in
  one header resolve to anonymous.
- `trpc/routers/__tests__/auth.test.ts`: `unsafeDecode` returns an `UntrustedJwt`, which
  the type system refuses wherever a `VerifiedJwt` is required.

The refresh token is still an opaque database row, as in `base-jwt`, so it is revocable
and rotates on every use. lacewing also has JWT refresh tokens (`newRefreshToken`,
`typ: rt+jwt`, a revocation store); the Express lacewing template uses those. Here the
database is the revocation store.

## CSRF

`base-jwt` relies on `SameSite=lax` and the CORS allowlist. That stops holding if someone
relaxes SameSite, adds a form post, or serves an attacker-controlled subdomain, so this
template adds a double submit:

- Every session mints a random token (`http/csrf.ts`) into the `csrf_token` cookie, the
  one cookie that is not httpOnly, because the page has to read it.
- The Vue tRPC client (`frontend/src/lib/trpc.ts`) echoes it as `x-csrf-token` on every
  call.
- `csrfGuard` (`trpc/trpc.ts`) rejects any mutation authenticated by cookie unless header
  and cookie match (timing-safe).

A cross-site page can make the browser send the cookies but cannot read them, so it
cannot produce the header. Bearer-authenticated calls are exempt, which is why gRPC needs
no CSRF handling. `app.test.ts` checks this over real HTTP: same session, same cookies,
no header, 403.

Sessions: access token is a lacewing JWT (`at+jwt`, HS256, 15 minutes) carrying `sub`,
`email` and `role`; refresh token is 32 random bytes stored as a SHA-256 hash and rotated
on use; CSRF token is 32 random bytes. Authorization is unchanged from
[`base-jwt`](../base-jwt).

## gRPC with auth

No cookies and no CSRF. Log in, take the tokens from the response body, and send the
access token as metadata:

```ts
const metadata = new grpc.Metadata();
metadata.set("authorization", `Bearer ${accessToken}`);

client.CreatePost({ title: "Hi", body: "there" }, metadata, callback);
```

## REST and OpenAPI

tRPC at `/trpc` is the whole API. These procedures also have a REST twin under `/api/v1`,
calling the same service function with the same arktype object, behind the same lacewing
auth (`http/auth.ts`) and CSRF rule:

| Route | Procedure |
| --- | --- |
| `POST /api/v1/auth/register` | `auth.register` |
| `POST /api/v1/auth/login` | `auth.login` |
| `POST /api/v1/auth/refresh` | `auth.refresh` |
| `POST /api/v1/auth/logout` | `auth.logout` |
| `GET /api/v1/auth/me` | `auth.me` |
| `GET /api/v1/posts` | `post.list` |
| `GET /api/v1/posts/:id` | `post.byId` |
| `POST /api/v1/posts` | `post.create` |

`post.update`, `post.delete`, the admin `user.*` and `health.*` are RPC-only. Errors come
back as `{ error: { code, message, requestId } }`.

Routes are described in `src/openapi/` and the OpenAPI 3.1 document is built with
arktype's `toJsonSchema()`. Outside production, `/docs` serves a Scalar page and
`/docs.json` the document. `bun run --cwd backend openapi` rewrites the committed
`backend/openapi.json` and needs no `.env`. The tests fail when the file is stale, a route
and its description disagree, or a response does not match the document.

## Tests

`bun run test`. Everything `base-jwt` covers, plus the CSRF 403 over real HTTP, the
readable vs httpOnly cookie split, and the claims lacewing puts on every access token
(`typ`, `iss`, `aud`, `jti`).

## Not included

- Rate limiting on login. Add it before you ship.
- Email verification and password reset. Both need a mailer.
- JWKS and asymmetric keys. One service signs and verifies, so HMAC is enough. When a
  second service has to verify these tokens, switch to `generateKeyPair()` (EdDSA) and
  give the profile a `{ jwksUri }`; lacewing handles caching and rotation. With HMAC
  across services every verifier can also mint tokens. If you have to do it anyway, see
  [docs/symmetric-jwks.md](../../docs/symmetric-jwks.md).
- `Bun.password`. Bun-only, and Vitest runs under Node; `@node-rs/argon2` runs under
  both.

## Environment

Beyond the base template's variables:

| Variable | Notes |
| --- | --- |
| `JWT_SECRET` | 32+ characters and entropy-checked (`openssl rand -base64 48`), or the app will not start. |
| `JWT_ACCESS_EXPIRY` | Default `15m`. lacewing caps access tokens at 1h and refuses to sign longer ones. |
| `JWT_ISSUER` / `JWT_AUDIENCE` | Set on and checked against every token. |
| `REFRESH_TOKEN_TTL_DAYS` | Default `7`. Revocable. |
| `COOKIE_SAME_SITE` | `lax` or `strict`. `none` is refused. Every cookie is Secure; `http://localhost` counts as a secure context. |
| `COOKIE_DOMAIN` | Unset, every cookie is host-only and a Vue app on another host cannot read `csrf_token`, so every mutation fails CSRF. See [PRODUCTION.md](../PRODUCTION.md). |

Before the first deploy, read [`../PRODUCTION.md`](../PRODUCTION.md).
