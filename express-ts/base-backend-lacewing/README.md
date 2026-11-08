# express-ts/base-backend-lacewing

[`base-backend-jwt`](../base-backend-jwt) rebuilt on
[lacewing](https://github.com/Smiduweorc/lacewing). Same routes and layout; signing,
verification, cookies and revocation go through lacewing, and CSRF is bound to the session
it creates. Express 5 + TypeScript, zod, winston, Swagger docs, Jest.

## Run it

```bash
npm install
npm run dev   # loads .env.development, which has random dev-only secrets
```

Node 24 or later (lacewing's minimum; see `.nvmrc`). For production:

```bash
cp .env.production.example .env.production
npm run secrets   # paste the output over the empty secret lines in .env.production
```

lacewing entropy-checks the HMAC secrets at boot, so `JWT_SECRET=my-super-secret-key...`
refuses to start. `npm run secrets` prints values that pass.

## Delete first

`login` in `controllers/auth.controller.ts` mints a session for a made-up user with any
email and password (`// TODO: Replace with actual user authentication logic`). Replace it.
Users are an in-memory `Map` in `controllers/user.controller.ts`.

## What lacewing does here

- `src/config/lacewing.ts`: issuer, audience, allowed algorithms and key declared once;
  `jwtVerify(token, profile)` is the only verify path. No `decode()`, no `alg: none`, no
  algorithm chosen by the header. The revocation store is set up here too.
- `src/middleware/auth.ts`: the presets pin `typ` to `at+jwt` and `rt+jwt` with different
  audiences, so a refresh token presented as an access token fails verification.
  `buildTokenCookie` always emits `HttpOnly; Secure; SameSite`, which is why there is no
  `COOKIE_SECURE`; the refresh cookie is path-scoped to the refresh endpoint.
  `parseBearer` does strict RFC 6750 parsing for non-browser clients: one header, one
  scheme, one token, never the query string. `JWTExpired`, `JWTRevoked` and every other
  failure reach the client as a plain 401.
- `auth.controller.ts`: every token has a unique `jti`. Logout revokes the access token
  immediately; refresh revokes the refresh token it consumed, so a stolen one works once
  at most.

CSRF is signed double submit (`csrf-csrf`) bound to the access token. Login and refresh
rotate the CSRF token with the session and return the new one in the body; mutating
routes need it in `x-csrf-token`. A client that keeps the token from login gets 403s from
the first refresh on, so read it from each response.

A second cookie with the same name is refused. Any host under `COOKIE_DOMAIN` can set
`access_token` and browsers send both copies, so a duplicated name is a 401 saying
`Ambiguous access token cookie`, distinguishable in the log from a logged-out request.

The auth tests (`src/routes/api/v1/__tests__/auth.routes.test.ts`) cover tampered tokens,
replayed refresh tokens, token confusion and revoked but unexpired access tokens.

## Auth routes

| Route | Does |
| --- | --- |
| `POST /api/v1/auth/login` | Sets `access_token` + `refresh_token` cookies, returns `{ user, csrfToken }` |
| `GET /api/v1/auth/me` | Whoever the verified token says you are |
| `POST /api/v1/auth/refresh` | Rotates both tokens and the CSRF token; revokes the refresh token it consumed |
| `POST /api/v1/auth/logout` | Revokes the access token, clears cookies (needs `x-csrf-token`) |
| `GET /api/v1/auth/csrf-token` | A fresh CSRF token for the current session |

Browsers use the httpOnly cookie; other clients can send `Authorization: Bearer <token>`.

## Adding a resource

As in [`base-backend`](../base-backend). Authenticated route tests log in first with the
helpers in `src/test/auth.ts`:

```typescript
import { asUser, loginSession } from "../../../../test/auth";

const session = await loginSession(app);
await request(app).get("/api/v1/products").set(asUser(session));
// mutations also need .set("x-csrf-token", session.csrfToken)
```

`GET /api/v1/users` is paginated: `?limit=` (default 20, at most 100) and `?offset=`
(default 0) return `{ items, total, limit, offset }`. Copy that shape for new list routes.

## Environment

As in `base-backend`, plus:

| Variable | Default | Description |
| --- | --- | --- |
| `SERVICE_NAME` | `lacewing-backend` | Service name for logs |
| `CORS_CREDENTIALS` | `false` | Allow credentials; needs a named `CORS_ORIGIN`, not `*` |
| `JWT_SECRET` | (required) | Access-token HMAC secret, entropy-checked |
| `JWT_REFRESH_SECRET` | (required) | Refresh-token HMAC secret, entropy-checked |
| `JWT_ISSUER` | `http://localhost:3000` | `iss` on every token; verification pins it |
| `JWT_AUDIENCE` | `http://localhost:3000/api/v1` | `aud` of access tokens (refresh tokens get the refresh endpoint) |
| `JWT_ACCESS_EXPIRY` | `15m` | lacewing caps it at 1h and refuses to sign longer |
| `JWT_REFRESH_EXPIRY` | `7d` | Refresh token lifetime |
| `COOKIE_SECRET` | (required) | Signed cookies (32+ chars) |
| `COOKIE_SAME_SITE` | `strict` | `strict` or `lax`; `none` is refused |
| `COOKIE_DOMAIN` | (unset) | Parent domain for the auth and CSRF cookies. Unset, they are host-only; see [PRODUCTION.md](../PRODUCTION.md) before splitting hosts |
| `CSRF_SECRET` | (required) | CSRF token HMAC (32+ chars) |

Every cookie is `HttpOnly; Secure`. Browsers treat `http://localhost` as a secure
context, so development works; anything else has to be HTTPS.

After changing a route, `npm run openapi` rewrites the committed `openapi.json`; `npm
test` fails when it is stale, when a mounted route is not described, or when a response
does not match its description.

## Known quirks

- `MemoryRevocationStore` is per-process. Behind more than one instance, implement
  lacewing's `RevocationStore` over Redis or your database and pass it in
  `src/config/lacewing.ts`.
- HMAC means every verifier can also mint. When a second service needs to verify these
  tokens, switch to `generateKeyPair()` (EdDSA) and serve a JWKS; the profiles take a
  `{ jwksUri }` in place of the key. To stay symmetric across services, read
  [docs/symmetric-jwks.md](../../docs/symmetric-jwks.md) first.
- lacewing and jose are ESM-only, so `jest.config.ts` transpiles them with the app
  sources (`transformIgnorePatterns`). Don't remove that block; the suite will fail with
  "Unexpected token 'export'".

Before the first deploy, read [`../PRODUCTION.md`](../PRODUCTION.md).
