# express-ts/base-backend-jwt

[`base-backend`](../base-backend) plus JWT auth in cookies (jsonwebtoken) and CSRF
protection (csrf-csrf). Everything in that README applies; this one covers what auth
adds.

## Run it

```bash
npm install
npm run dev   # loads .env.development, which has dev-only secrets
```

Node 24 (`.nvmrc`). For production, `cp .env.production.example .env.production` and set
the four secrets; `npm start` runs the build with that file.

## Delete first

`login` in `controllers/auth.controller.ts` authenticates nobody:

```ts
// TODO: Replace with actual user authentication logic
const userId = "user-" + Math.random().toString(36).substring(2, 9);
```

Any email and password get a session. Replace that line with a real credential check.
Users are an in-memory `Map` in `controllers/user.controller.ts`, as in `base-backend`.

## Routes

Under `/api/v1/auth`: `GET /csrf-token`, `POST /login`, `POST /logout`,
`POST /refresh`, `GET /me`. Adding a resource works as in `base-backend`; protect its
routes like this:

```typescript
import { authenticate } from "../middleware/auth";
import { doubleCsrfProtection } from "../middleware/csrf";

router.get("/", authenticate, handler);                         // login required
router.post("/", authenticate, doubleCsrfProtection, handler);  // login + CSRF token
```

## CSRF quirks

- The CSRF token is HMAC-bound to the access-token cookie, so it stops validating when
  that cookie rotates. Login and refresh both return a fresh `csrfToken` in the body. A
  client that keeps the one from login gets 403s from the first refresh on. Read it from
  each response.
- `POST /auth/refresh` needs the `x-csrf-token` header too, so a cross-site form cannot
  rotate the session when `COOKIE_SAME_SITE=none`. Send the token you already hold. The
  `access_token` cookie lives for `JWT_REFRESH_EXPIRY`, not `JWT_ACCESS_EXPIRY`, so it is
  still there to check against after the JWT inside it has expired.
- A second cookie with the same name is refused. Any host under `COOKIE_DOMAIN` can set
  `access_token`, browsers send both copies and nothing says which wins, so
  `authenticate` treats a duplicated name as no session.

## Environment

As in `base-backend`, plus:

| Variable | Default | Description |
| --- | --- | --- |
| `SERVICE_NAME` | `jwt-backend` | Service name for logs |
| `CORS_CREDENTIALS` | `false` | Allow credentials. `.env.development` sets `true`; you then have to name an origin |
| `JWT_SECRET` | (required) | Signs access tokens (32+ chars) |
| `JWT_REFRESH_SECRET` | (required) | Signs refresh tokens (32+ chars) |
| `JWT_ACCESS_EXPIRY` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRY` | `7d` | Refresh token lifetime |
| `COOKIE_SECRET` | (required) | Signs cookies (32+ chars) |
| `COOKIE_SECURE` | `true` | Secure flag on cookies |
| `COOKIE_SAME_SITE` | `strict` | SameSite attribute |
| `COOKIE_DOMAIN` | (unset) | Parent domain for the session and CSRF cookies. Unset, they are host-only; see [PRODUCTION.md](../PRODUCTION.md) before splitting hosts |
| `CSRF_SECRET` | (required) | CSRF token HMAC (32+ chars) |

After changing a route description or a schema it uses, `npm run openapi` rewrites the
committed `openapi.json`.

Before the first deploy, read [`../PRODUCTION.md`](../PRODUCTION.md).
