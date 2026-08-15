# Express TypeScript Backend Template (lacewing)

The JWT template, rebuilt on [lacewing](https://github.com/Smiduweorc/lacewing) - an
opinionated JWT library that makes RFC 8725 (JWT Best Current Practices) the default
behavior rather than optional configuration. This template doubles as a working demo of
what that buys you: same routes and layout as `base-backend-jwt`, but the entire token
lifecycle - signing, verification, transport, revocation - goes through lacewing, and the
CSRF protection is wired to the session it creates.

Express 5 + TypeScript, Zod validation, Winston logging, Swagger docs, Jest tests.

## What lacewing does here

| Concern                 | Where                                          | What you get                                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Verification profiles   | `src/config/lacewing.ts`                       | Issuer, audience, algorithm allowlist and key source declared once; `jwtVerify(token, profile)` is the only verify path. No `decode()`, no `alg: none`, no header-chosen algorithms.                               |
| Access vs refresh split | `src/middleware/auth.ts`                       | The cookbook presets pin `typ` to `at+jwt` / `rt+jwt` and different audiences. A refresh token presented as an access token fails verification even though the claims and key family match.                        |
| Revocation              | `src/config/lacewing.ts`, `auth.controller.ts` | Every token carries a unique `jti`. Logout revokes the access token _now_, not at `exp`; refresh rotation revokes the used refresh token, so a stolen one is good for at most one use.                             |
| Secret hygiene          | `src/config/env.ts` + boot                     | HMAC secrets are entropy-checked at import. `JWT_SECRET=my-super-secret-key...` refuses to boot - run `npm run secrets` for values that pass.                                                                      |
| Cookie transport        | `src/middleware/auth.ts`                       | `buildTokenCookie` always emits `HttpOnly; Secure; SameSite` - weaker cookies are unrepresentable, which is why there is no `COOKIE_SECURE` env switch. The refresh cookie is path-scoped to the refresh endpoint. |
| Bearer transport        | `src/middleware/auth.ts`                       | `parseBearer` does strict RFC 6750 parsing for non-browser clients - one header, one scheme, one token, never the query string.                                                                                    |
| Typed errors            | `src/middleware/auth.ts`                       | `JWTExpired`, `JWTRevoked`, and everything else collapses to a plain 401 - no oracle for attackers, precise handling for you.                                                                                      |

CSRF protection is the signed double-submit pattern (`csrf-csrf`), bound to the access
token as the session identifier - login and refresh both rotate the CSRF token along with
the session and return the new one in the response body. State-changing routes require the
`x-csrf-token` header.

The auth tests (`src/routes/api/v1/__tests__/auth.routes.test.ts`) exercise each of these
guarantees against the live app - tampered tokens, replayed refresh tokens, token
confusion, revoked-but-unexpired access tokens - and are a decent tour of the library.

## Quick Start

```bash
npm install

# The app will not boot with placeholder secrets - lacewing entropy-checks
# them. Generate real ones and put them in .env:
cp .env.example .env
npm run secrets   # paste its output over the empty secret lines in .env

# Development (hot reload)
npm run dev

# Run tests
npm test

# Build for production
npm run build
npm start
```

Requires Node >= 24 (lacewing's floor; see `.nvmrc`).

## Auth flow

```
POST /api/v1/auth/login     -> sets access_token + refresh_token cookies,
                               returns { user, csrfToken }
GET  /api/v1/auth/me        -> whoever the verified token says you are
POST /api/v1/auth/refresh   -> rotates both tokens + csrfToken; revokes the
                               refresh token it just consumed
POST /api/v1/auth/logout    -> revokes the access token, clears cookies
                               (needs x-csrf-token)
GET  /api/v1/auth/csrf-token-> a fresh CSRF token for the current session
```

Browsers authenticate with the httpOnly cookie; everything else can send
`Authorization: Bearer <token>` instead. Mutating routes additionally require the
`x-csrf-token` header matching the token from login/refresh.

## Project Structure

```
.
├── Dockerfile
├── eslint.config.mjs
├── jest.config.ts
├── nodemon.json
├── package.json
├── README.md
├── src
│   ├── app.ts
│   ├── config
│   │   ├── env.ts
│   │   ├── lacewing.ts        <- profiles, keys, revocation store
│   │   └── swagger.ts
│   ├── controllers
│   │   ├── auth.controller.ts <- login / refresh rotation / logout revocation
│   │   ├── health.controller.ts
│   │   └── user.controller.ts
│   ├── main.ts
│   ├── middleware
│   │   ├── auth.ts            <- sign/verify helpers, cookies, authenticate
│   │   ├── csrf.ts            <- double-submit CSRF, session-bound
│   │   ├── errorHandler.ts
│   │   ├── httpLogger.ts
│   │   └── validate.ts
│   ├── models
│   ├── routes
│   ├── test
│   ├── types
│   └── utils
└── tsconfig.json
```

## Adding a New Feature

Identical to `base-backend-jwt`: model (Zod schema + factory) -> controller -> routes ->
register in `src/routes/api/v1/index.ts` -> tests. See that template's README for the
full worked "Product" example; the only difference here is that authenticated route tests
log in first via the `loginSession` helper in `src/test/auth.ts`:

```typescript
import { asUser, loginSession } from "../../../../test/auth";

const session = await loginSession(app);
await request(app).get("/api/v1/products").set(asUser(session));
// mutations additionally need: .set("x-csrf-token", session.csrfToken)
```

## Environment Variables

| Variable             | Default                        | Description                                                                |
| -------------------- | ------------------------------ | -------------------------------------------------------------------------- |
| `NODE_ENV`           | `development`                  | Environment mode                                                           |
| `PORT`               | `3000`                         | Server port                                                                |
| `LOG_LEVEL`          | `info`                         | Winston log level                                                          |
| `SERVICE_NAME`       | `lacewing-backend`             | Service name for logs                                                      |
| `CORS_ORIGIN`        | `*`                            | Allowed origins (comma-separated)                                          |
| `CORS_METHODS`       | `GET,POST,PUT,...`             | Allowed methods                                                            |
| `CORS_CREDENTIALS`   | `true`                         | Allow credentials                                                          |
| `JWT_SECRET`         | (required)                     | Access-token HMAC secret. Entropy-checked at boot - use `npm run secrets`. |
| `JWT_REFRESH_SECRET` | (required)                     | Refresh-token HMAC secret. Same rules.                                     |
| `JWT_ISSUER`         | `http://localhost:3000`        | `iss` on every token; verification pins it                                 |
| `JWT_AUDIENCE`       | `http://localhost:3000/api/v1` | `aud` of access tokens (refresh tokens get the refresh endpoint)           |
| `JWT_ACCESS_EXPIRY`  | `15m`                          | Access token lifetime. lacewing caps it at 1h; longer refuses to sign.     |
| `JWT_REFRESH_EXPIRY` | `7d`                           | Refresh token lifetime                                                     |
| `COOKIE_SECRET`      | (required)                     | Secret for signed cookies (min 32 chars)                                   |
| `COOKIE_SAME_SITE`   | `strict`                       | `strict` or `lax`. `none` is not accepted - that is how CSRF happens.      |
| `CSRF_SECRET`        | (required)                     | Secret for CSRF token HMAC (min 32 chars)                                  |

There is deliberately no `COOKIE_SECURE`: every cookie is `HttpOnly; Secure`,
unconditionally. Browsers treat `http://localhost` as a secure context, so development
works unchanged; anything non-local has to be HTTPS, which is the correct constraint to
be stuck with.

## Available Scripts

| Script                  | Description                                                     |
| ----------------------- | --------------------------------------------------------------- |
| `npm run dev`           | Start with hot reload                                           |
| `npm run secrets`       | Print entropy-check-passing values for the four secret env vars |
| `npm run build`         | Compile TypeScript                                              |
| `npm start`             | Run production build                                            |
| `npm test`              | Run all tests                                                   |
| `npm run test:watch`    | Watch mode                                                      |
| `npm run test:coverage` | With coverage                                                   |

## API Documentation

Swagger UI available at `http://localhost:3000/docs` when the server is running.

## Scaling notes

- `MemoryRevocationStore` is per-process. Behind more than one instance, implement
  lacewing's `RevocationStore` interface over Redis or your database and pass it in
  `src/config/lacewing.ts` - nothing else changes.
- HMAC means every verifier can also mint. The moment a second service needs to verify
  these tokens, switch to `generateKeyPair()` (EdDSA) and serve a JWKS - the profiles
  take a `{ jwksUri }` in place of the key and handle caching and rotation themselves.
  If you must stay symmetric while sharing keys across services, read
  [docs/symmetric-jwks.md](../../docs/symmetric-jwks.md) first - a symmetric JWKS is a
  secret document, and there is exactly one safe way to run an endpoint for it.
- Jest note: lacewing and jose ship ESM-only, so `jest.config.ts` transpiles them
  alongside the app sources (`transformIgnorePatterns`). Don't remove that block - the
  suite will fail with "Unexpected token 'export'".

## Before production

[`../PRODUCTION.md`](../PRODUCTION.md) is the list of what these templates deliberately do
not do - rate limiting, TLS, a real datastore, a shared revocation store - which of those
your platform probably handles for you, and a short list of things that are simply bugs.
Read it before the first deploy, not after.
