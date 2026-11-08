# bevd/base

Bun + Elysia + Vue + Drizzle, serving REST, tRPC and gRPC over one set of services. No
authentication. For logins and roles take [`bevd/base-jwt`](../base-jwt), which is this
template with auth added. The layout and the `ServiceCtx` rule are described in the
[bevd README](../README.md).

## Run it

```sh
bun install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
bun run db:up && bun run db:push   # Postgres in Docker, then the tables
bun run dev                        # backend :3000, frontend :5173
```

`bun run db:seed` adds a few posts. The other tasks are in `package.json`.

| Where | What |
| ----- | ---- |
| http://localhost:5173 | The Vue app |
| http://localhost:3000/health | REST health check |
| http://localhost:3000/api/v1 | REST twins of the core post procedures |
| http://localhost:3000/trpc | tRPC |
| http://localhost:3000/docs | OpenAPI UI (Scalar), not served in production |
| http://localhost:3000/docs.json | The OpenAPI document, same as `backend/openapi.json` |
| `localhost:50051` | gRPC (`bevd.post.v1.PostService`) |

## Delete first

`post` is the example resource: `db/schema.ts`, `services/post.service.ts`, and its
router, REST routes, gRPC handler, proto and OpenAPI paths. Replace it with your own.

## How the transports map

`src/services/post.service.ts` takes a database and an input and returns a value or throws
an `AppError`. It knows nothing about tRPC, gRPC or HTTP.

| | tRPC | REST | gRPC |
| --- | --- | --- | --- |
| Input validation | arktype schema | the same schema | the same schema |
| `AppError("NOT_FOUND")` | HTTP 404 | HTTP 404 | `status.NOT_FOUND` |
| `AppError("BAD_REQUEST")` | HTTP 400 | HTTP 400 | `status.INVALID_ARGUMENT` |

`frontend/src/lib/trpc.ts` imports `AppRouter` as a type only, so no server code reaches
the bundle, but the client knows every procedure:

```ts
const posts = await trpc.post.list.query({ limit: 20 });
//    ^? Post[], inferred from the Drizzle schema through the router
```

Rename a column in `db/schema.ts` and the Vue component stops compiling.

## REST and OpenAPI

For clients that cannot use the tRPC client, three REST routes under `/api/v1`:

| Route | Twin of |
| ----- | ------- |
| `GET /api/v1/posts?limit=&publishedOnly=` | `post.list` |
| `GET /api/v1/posts/:id` | `post.byId` |
| `POST /api/v1/posts` (answers 201) | `post.create` |

Each calls the same service function as its procedure and is validated with the same
arktype object. Errors answer `{ "error": { "code", "message", "requestId" } }` with the
status tRPC would use.

`post.update`, `post.delete`, `health.ping` and `health.db` have no REST twin; call them
over `/trpc` or gRPC. `post.update` takes the id and the changes as one object, and a
`PATCH /posts/:id` would need that split into a path schema and a body schema. Add a twin
when a REST client needs one.

`src/openapi/` describes each REST route once, holding the same schema objects. arktype's
`toJsonSchema()` emits JSON Schema 2020-12, so the document is OpenAPI 3.1.
`@elysiajs/openapi` renders it at `/docs` with its own route inference off. After changing
a route, run `bun run --cwd backend openapi` to rewrite `backend/openapi.json`. The tests
fail if a served route is undescribed (unless exempted in `openapi/responseCheck.ts`), if a
response does not match its description, or if `openapi.json` is stale.

## gRPC

gRPC needs HTTP/2 and Elysia speaks HTTP/1.1, so the gRPC server listens on its own port
(`GRPC_PORT`, default 50051) in the same process. `@grpc/grpc-js` runs fine on Bun.

```sh
grpcurl -plaintext -d '{"title":"Hi","body":"there"}' \
  -import-path backend/proto -proto post.proto \
  localhost:50051 bevd.post.v1.PostService/CreatePost
```

## Tests

`bun run test`. Backend tests run against PGlite (Postgres compiled to WebAssembly, in
process) with the same `drizzle/` migrations production uses. No Docker. The gRPC tests
bind a real port and call it with a real client.

## Things that will bite you

- Vitest runs its workers under Node, not Bun. `typeof Bun === "undefined"` inside a
  test, so anything importing `Bun.password` or `bun:sqlite` breaks when a test touches
  it. Keep library code runtime-portable (`process.env`, not `Bun.env`) or switch to
  `bun test`.
- `biome.jsonc`, not `biome.json`. Biome treats a comment in `biome.json` as a parse
  error and then *silently falls back to defaults*: your rules look applied but are not.
- Elysia's `.mount()` strips the path prefix, so tRPC's fetch adapter is configured with
  `endpoint: ""`. Setting it to `"/trpc"` 404s every call. `.mount` is also what hands
  tRPC an intact request body; a plain `.all("/trpc/*")` route lets Elysia parse the body
  first and every mutation dies. See `src/app.ts`.
- A query string is all strings. `GET /api/v1/posts?limit=5` arrives as `"5"`, and
  `ListPostsInput` wants a number. `rest/post.ts` converts it before validation.
- arktype's optional key means absent. `{ limit: undefined }` is a present key with an
  invalid value and fails validation; spread the key in only when it has a value.
- tRPC serializes with plain JSON, so a `Date` from Drizzle reaches the browser as an ISO
  string, and the inferred types say so. Add `superjson` on both ends if you want `Date`s.
- Biome lints a Vue SFC's `<script>` without the `<template>`, so anything used only in
  markup looks unused. `noUnusedImports` and `noUnusedVariables` are off for `.vue` (see
  `biome.jsonc`); `vue-tsc` catches the real cases.
- The backend is not bundled. `bun run build` builds the frontend only; Bun runs the
  backend TypeScript directly, in the container too.

Before the first deploy, read [`../PRODUCTION.md`](../PRODUCTION.md).
