# express-ts/base-backend

Express 5 + TypeScript with zod validation, winston logging, OpenAPI docs built from the
zod schemas, and Jest tests. No auth, no database.

## Run it

```bash
npm install
npm run dev   # loads .env.development
```

Node 24 (`.nvmrc`). For production, `cp .env.production.example .env.production`;
`npm start` runs the build with that file.

## Delete first

`users` is the example resource, kept in an in-memory `Map` in
`controllers/user.controller.ts`. Replace it with your own storage, or delete
`models/user.model.ts`, `controllers/user.controller.ts`,
`routes/api/v1/user.routes.ts`, `openapi/paths/users.ts` and their tests.

## Adding a resource

Copy the `user` files and rename:

1. `src/models/<name>.model.ts`: the zod schemas; types come from `z.infer`.
2. `src/controllers/<name>.controller.ts`.
3. `src/routes/api/v1/<name>.routes.ts`, using `validate({ body, params, query })`, and
   register it in `src/routes/api/v1/index.ts`.
4. `src/openapi/paths/<name>.ts`, describing each route with the same zod objects the
   validator runs. Import it in `src/openapi/index.ts` and add the router to `mounts` in
   `src/openapi/__tests__/openapi.test.ts`.
5. Tests next to the user ones in `__tests__/`.
6. `npm run openapi` to rewrite the committed `openapi.json`.

The OpenAPI tests fail if a mounted route has no description, if a description holds a
different schema object than the validator, or if a response body does not match it.

## Patterns

- Errors: throw `createError(404, "Resource not found")` (http-errors, re-exported from
  `middleware/errorHandler`). The handler answers with its status and
  `{ success: false, message }`. A 4xx message reaches the client; a 5xx or any other
  thrown error becomes "Internal server error". The full error is logged either way.
- Async handlers need no wrapper: Express 5 forwards a rejected promise to the error
  handler.
- Logging: `import logger from "../utils/logger"`, then
  `logger.info("Server started", { port: 3000 })`.

## Environment

`config/env.ts` validates these with zod at startup. Both env files are loaded with
Node's `--env-file-if-exists`, so they are optional and a real environment variable wins.

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `3000` | Server port |
| `LOG_LEVEL` | `info` | Winston log level |
| `SERVICE_NAME` | `base-backend` | Service name for logs |
| `CORS_ORIGIN` | `*` | Allowed origins (comma-separated) |
| `CORS_METHODS` | `GET,POST,PUT,PATCH,DELETE,OPTIONS` | Allowed methods |
| `CORS_CREDENTIALS` | `false` | Allow credentials |

## API docs

Outside production, Swagger UI is at `http://localhost:3000/docs` and the OpenAPI 3.0.3
document at `/docs.json`, both built from `src/openapi/paths/`. `openapi.json` is the
committed copy.

Before the first deploy, read [`../PRODUCTION.md`](../PRODUCTION.md).
