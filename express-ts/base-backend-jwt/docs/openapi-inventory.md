# OpenAPI inventory

The swagger-jsdoc annotations as they stood before the move to the schema-first
registry in `src/openapi/`, checked against the code. Paths are relative to
`/api/v1`. "Session" means the `authenticate` middleware (the `access_token`
cookie); "CSRF" means `doubleCsrfProtection` (the `x-csrf-token` header).

| File | Method | Path | Params | Body | Responses (annotated) | Auth (code) |
| --- | --- | --- | --- | --- | --- | --- |
| health.routes.ts | GET | /health | | | 200 `{status, timestamp}` | none |
| auth.routes.ts | GET | /auth/csrf-token | | | 200 CsrfTokenResponse | none |
| auth.routes.ts | POST | /auth/login | | LoginRequest (`loginSchema`) | 200 AuthResponse, 400 | none |
| auth.routes.ts | POST | /auth/logout | | | 200 (no schema) | session, CSRF |
| auth.routes.ts | POST | /auth/refresh | | | 200 AuthResponse, 401 | `refresh_token` cookie |
| auth.routes.ts | GET | /auth/me | | | 200 (no schema), 401 | session |
| user.routes.ts | GET | /users | | | 200 User[], 401 | session |
| user.routes.ts | POST | /users | | CreateUser (`createUserSchema`) | 201 User, 400 Error, 401, 403 | session, CSRF |
| user.routes.ts | GET | /users/{id} | id: uuid | | 200 User, 401, 404 Error | session |
| user.routes.ts | PATCH | /users/{id} | id: uuid | UpdateUser (`updateUserSchema`) | 200 User, 401, 403, 404 | session, CSRF |
| user.routes.ts | DELETE | /users/{id} | id: uuid | | 204, 401, 403, 404 | session, CSRF |

No route takes a query string. Every error goes through `errorHandler`, which
answers `{success: false, message, stack?}` (`stack` only when NODE_ENV is
development).

## Where the annotations disagree with the code

- `cookieAuth` is named in `security` on six routes but never defined under
  `components.securitySchemes`, so the old document refers to nothing.
- `POST /auth/refresh` claims AuthResponse, which has `user`. The handler
  returns `{success, message, csrfToken}` with no `user`.
- `POST /auth/logout` and `GET /auth/me` declare no 200 body. They return
  `{success, message}` and `{success, user}`; `user` is the decoded JWT payload,
  so it carries `iat` and `exp` beside `userId` and `email`.
- `POST /auth/logout` does not list 401 or 403, which `authenticate` and the
  CSRF check return.
- `GET`, `PATCH` and `DELETE /users/{id}` do not list 400, which `validate`
  returns for an id that is not a UUID. `PATCH` does not list 400 for a bad body.
- `UpdateUser` drops the 1 to 100 length bounds on `name` that
  `updateUserSchema` enforces. `User` lists no required fields and no bounds.
- The `Error` schema leaves out the development-only `stack` field, and only two
  responses reference it; the rest have no body.
- `x-csrf-token` is declared as a header parameter on the CSRF routes. The
  registry documents it as a second security scheme instead, since it is part of
  how those routes authenticate rather than an input to the operation.
