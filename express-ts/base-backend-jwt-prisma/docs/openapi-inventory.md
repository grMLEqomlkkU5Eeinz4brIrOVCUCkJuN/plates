# OpenAPI inventory

The swagger-jsdoc annotations as they stood before the move to the schema-first
registry in `src/openapi/`, read against the code. Paths are relative to
`/api/v1`. "Session" means `authenticate` runs (access cookie); "CSRF" means
`doubleCsrfProtection` runs (`x-csrf-token` header).

None of the old annotations declared a request or response body. Bodies below
are taken from the validators and the handlers.

## Health (`src/routes/api/v1/health.routes.ts`)

| Method | Path | Auth | Request | Responses |
|---|---|---|---|---|
| GET | /health | none | none | 200 `{ status: "ok", timestamp }` |
| GET | /health/ready | none | none | 200 `{ status: "ok", database: "up", timestamp }`; 503 `{ success: false, code: "DEPENDENCY_UNAVAILABLE", status: "degraded", database: "down", requestId }` |

## Auth (`src/routes/api/v1/auth.routes.ts`)

| Method | Path | Auth | Request | Responses |
|---|---|---|---|---|
| GET | /auth/csrf-token | none | none | 200 `{ csrfToken }` |
| POST | /auth/register | none, rate limited | body `registerSchema` | 201 `{ user: Account, csrfToken }`; 400; 409 EMAIL_TAKEN; 429 |
| POST | /auth/login | none, rate limited | body `loginSchema` | 200 `{ user: Account, csrfToken }`; 401 INVALID_CREDENTIALS; 429 |
| POST | /auth/refresh | none (refresh cookie), rate limited | none | 200 `{ csrfToken }`; 401 REFRESH_INVALID or REFRESH_REUSED |
| POST | /auth/logout | session, CSRF | none | 204; 403 CSRF_INVALID |

## Users (`src/routes/api/v1/user.routes.ts`)

| Method | Path | Auth | Request | Responses |
|---|---|---|---|---|
| GET | /users/me | session | none | 200 `{ user: Account }`; 401 |
| PATCH | /users/me | session, CSRF | body `updateAccountSchema` | 200 `{ user: Account }`; 400; 409 EMAIL_TAKEN |
| DELETE | /users/me | session, CSRF, rate limited | body `deleteAccountSchema` | 204; 401 INVALID_CREDENTIALS |
| GET | /users | session | query `listUsersQuery` | 200 `{ users: PublicUser[] }` |
| GET | /users/:id | session | params `userIdParams` | 200 `{ user: PublicUser }`; 400; 404 NOT_FOUND |

## Where the annotations disagree with the code

Each is an omission in the old text; the code is unchanged and the new
document follows the code.

- No route declared a request or response body. The 503 from
  `/health/ready` is not the shared error body (it has `status` and
  `database`, and no `message`); the old text did not say so.
- `POST /auth/login` runs `validate`, so it answers 400 VALIDATION_ERROR; not
  listed.
- `POST /auth/refresh` is rate limited (`rateLimit("refresh")`); 429 not
  listed.
- `POST /auth/logout` sits behind `authenticate`; 401 not listed.
- `PATCH /users/me`: 401 (session) and 403 (CSRF) not listed.
- `DELETE /users/me`: 400 (validate), 403 (CSRF) and 429 (rate limit) not
  listed.
- `GET /users`: 400 (query validation) and 401 not listed.
- `GET /users/:id`: 401 not listed.
- `GET /users/me` lists 401 as UNAUTHENTICATED, TOKEN_EXPIRED or
  TOKEN_INVALID; correct, and true of every session route.
- The old document's title was `env.SERVICE_NAME`, so it changed with the
  deployment. The generated file uses the default name,
  `jwt-prisma-backend`, so it is identical wherever it is produced.
