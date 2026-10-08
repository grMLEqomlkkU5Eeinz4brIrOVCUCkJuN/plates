# OpenAPI inventory

Every route that carried an `@swagger` block, as the annotation stated it and as
the code behaves. Paths are relative to `/api/v1`.

Auth in this template is lacewing, not an app header plus a bearer token:

- access token: the `access_token` cookie, or `Authorization: Bearer <token>`
  when no such cookie is sent (`middleware/auth.ts`, `authenticate`).
- refresh token: the `refresh_token` cookie, path-scoped to `/auth/refresh`.
- CSRF: `doubleCsrfProtection` (csrf-csrf) needs the `x-csrf-token` header and
  the `__csrf` cookie on POST, PATCH and DELETE. It is mounted on every
  authenticated mutating route, and not on `/auth/login` or `/auth/refresh`.

The annotations named a `cookieAuth` scheme but never defined it under
`components.securitySchemes`, and never mentioned the bearer header.

Every error goes through `errorHandler`: `{ success: false, message }`, plus
`stack` in development. The annotations declared that body (`Error`) on two
responses only.

## Health (`routes/api/v1/health.routes.ts`)

| Method | Path | Request | Responses | Auth |
| --- | --- | --- | --- | --- |
| GET | `/health` | none | 200 `{ status, timestamp }` | none |

## Auth (`routes/api/v1/auth.routes.ts`)

| Method | Path | Request | Responses | Auth |
| --- | --- | --- | --- | --- |
| GET | `/auth/csrf-token` | none | 200 `CsrfTokenResponse` | none |
| POST | `/auth/login` | body `LoginRequest` (`loginSchema`) | 200 `AuthResponse`, 400 | none |
| POST | `/auth/logout` | header `x-csrf-token` | 200 (no schema) | `cookieAuth` |
| POST | `/auth/refresh` | none | 200 `AuthResponse`, 401 | none |
| GET | `/auth/me` | none | 200 (no schema), 401 | `cookieAuth` |

Disagreements with the code:

- `POST /auth/refresh`: the annotation says the 200 body is `AuthResponse`. The
  handler sends `{ success, message, csrfToken }` and no `user`.
- `POST /auth/refresh`: the annotation lists no security. The route needs the
  `refresh_token` cookie; without it the answer is 401.
- `POST /auth/logout`: the annotation lists 200 only. `authenticate` answers 401
  and csrf-csrf answers 403.
- `GET /auth/me`: no 200 schema. The handler sends `{ success, user }` where
  `user` is the verified token: `userId`, `email`, `jti`, `exp`.

## Users (`routes/api/v1/user.routes.ts`)

| Method | Path | Request | Responses | Auth |
| --- | --- | --- | --- | --- |
| GET | `/users` | none | 200 `User[]`, 401 | `cookieAuth` |
| POST | `/users` | header `x-csrf-token`, body `CreateUser` (`createUserSchema`) | 201 `User`, 400 `Error`, 401, 403 | `cookieAuth` |
| GET | `/users/{id}` | path `id` uuid | 200 `User`, 401, 404 `Error` | `cookieAuth` |
| PATCH | `/users/{id}` | path `id`, header `x-csrf-token`, body `UpdateUser` (`updateUserSchema`) | 200 `User`, 401, 403, 404 | `cookieAuth` |
| DELETE | `/users/{id}` | path `id`, header `x-csrf-token` | 204, 401, 403, 404 | `cookieAuth` |

Disagreements with the code:

- `GET`, `PATCH` and `DELETE /users/{id}` answer 400 for an id that is not a
  uuid (`validate`); none of the annotations list it.
- `PATCH /users/{id}` answers 400 for an invalid body; not listed.
- `UpdateUser` in the annotation drops `minLength: 1, maxLength: 100` from
  `name`; `updateUserSchema` keeps them.
- `User` lists no required properties; `userSchema` requires all five.
- `GET /users` returns every user with no pagination. Out of scope for this
  conversion; noted, not changed.
