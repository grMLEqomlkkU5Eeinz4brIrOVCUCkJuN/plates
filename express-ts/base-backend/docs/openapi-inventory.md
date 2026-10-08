# OpenAPI inventory

The swagger-jsdoc annotations as they stood before the move to the schema-first
registry, checked against the code. Paths are relative to `/api/v1`. No route
has authentication; the template has no auth layer.

| File | Method | Path | Params | Query | Body | Responses |
| --- | --- | --- | --- | --- | --- | --- |
| `health.routes.ts` | GET | `/health` | | | | 200 `{ status, timestamp }` |
| `user.routes.ts` | GET | `/users` | | | | 200 `User[]` |
| `user.routes.ts` | POST | `/users` | | | `CreateUser` | 201 `User`, 400 `Error` |
| `user.routes.ts` | GET | `/users/{id}` | `id` uuid | | | 200 `User`, 404 `Error` |
| `user.routes.ts` | PATCH | `/users/{id}` | `id` uuid | | `UpdateUser` | 200 `User`, 404 (no body) |
| `user.routes.ts` | DELETE | `/users/{id}` | `id` uuid | | | 204, 404 (no body) |

Components declared by hand in `user.routes.ts`: `User`, `CreateUser`,
`UpdateUser`, `Error`.

## Where the annotations disagree with the code

- `GET`, `PATCH` and `DELETE /users/{id}` return 400 when `id` is not a uuid
  (`validate(idParamSchema)`). None of the three documents a 400. `PATCH` also
  returns 400 for an invalid body.
- `PATCH` and `DELETE /users/{id}` document 404 with no body. The error handler
  sends the `{ success, message }` body on every error.
- `UpdateUser.name` has no length limits in the annotation. The validator is
  `createUserSchema.partial()`, so `name` is still 1 to 100 characters.
- `User.name` has no length limits in the annotation; the model has 1 to 100.
- `Error` lists `success` and `message`. Under `NODE_ENV=development` the error
  handler adds `stack`.
- `GET /health` describes `status` as any string with example `ok`. The
  controller always sends the literal `"ok"`.
- The spec's `info.title` comes from `SERVICE_NAME`, so the rendered document
  changes with the environment.

## Changes made after the conversion

- `GET /users` is paginated: `limit` (1 to 100, default 20) and `offset`
  (0 or more, default 0) in the query; anything else is a 400. The response
  changed from a bare `User[]` to `{ items, total, limit, offset }`.
- `validate` used to write parsed query values into `req.query`, which on
  Express 5 is a getter that re-parses the URL, so coerced values and
  defaults never reached the handler. It now shadows `req.query`.
