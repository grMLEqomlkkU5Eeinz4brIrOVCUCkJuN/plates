# bevd/base

Bun + Elysia + Vue + Drizzle. Three ways in - REST, tRPC and gRPC - over one set of
services. **No authentication.** If you need logins and roles, take
[`bevd/base-jwt`](../base-jwt) instead; it is this template with auth added.

```
base/
├── backend/          Elysia (REST + tRPC) + gRPC + Drizzle
│   ├── proto/        The .proto the gRPC server serves
│   └── src/
│       ├── services/ the business logic. Everything else is transport.
│       ├── trpc/     tRPC router (mounted on Elysia)
│       ├── grpc/     gRPC server (its own port)
│       ├── db/       Drizzle schema + migrations
│       └── lib/      errors and logger. Cross-cutting only.
└── frontend/         Vue 3 + Vite, calling tRPC with end-to-end types
    └── src/
        ├── composables/ everything that talks to the server
        └── components/  markup and local form state
```

Every service function takes the same two arguments - a `ServiceCtx` (the database and a
logger; the auth templates add an actor) and its input. Both transports' context types are
supersets of that, so a tRPC resolver hands itself straight in: `listPosts(ctx, input)`,
with the Request and response headers invisible to the service on the other side.

## Run it

```sh
bun install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

bun run db:up        # Postgres in Docker
bun run db:push      # create the tables
bun run db:seed      # optional: a few posts

bun run dev          # backend :3000, frontend :5173
```

| Where | What |
| ----- | ---- |
| http://localhost:5173 | The Vue app |
| http://localhost:3000/health | REST |
| http://localhost:3000/trpc | tRPC |
| http://localhost:3000/openapi | OpenAPI UI |
| `localhost:50051` | gRPC (`bevd.post.v1.PostService`) |

## The one idea worth copying

**Services own the logic. Transports only translate.**

`src/services/post.service.ts` takes a database and an input and either returns a value
or throws an `AppError`. It has never heard of tRPC, gRPC or HTTP. Each transport is a
thin adapter over it:

| | tRPC | gRPC |
| --- | --- | --- |
| Input validation | arktype schema, shared | the same arktype schema |
| `AppError("NOT_FOUND")` becomes | HTTP 404 | `status.NOT_FOUND` |
| `AppError("BAD_REQUEST")` becomes | HTTP 400 | `status.INVALID_ARGUMENT` |

Add a procedure once and both APIs can serve it. There is no second copy of a rule to
forget to update - which is exactly the bug the JWT template's authorization checks are
designed to avoid.

## Typed to the browser

`frontend/src/lib/trpc.ts` imports `AppRouter` **as a type**. Nothing from the server
reaches the bundle, but the client knows every procedure, argument and return type:

```ts
const posts = await trpc.post.list.query({ limit: 20 });
//    ^? Post[] - inferred from the Drizzle schema, through the router
```

Rename a column in `db/schema.ts` and the Vue component stops compiling. That is the
point of the whole arrangement.

## gRPC

gRPC needs HTTP/2 and Elysia speaks HTTP/1.1, so the gRPC server listens on its own port
(`GRPC_PORT`, default 50051) in the same process. `@grpc/grpc-js` runs fine on Bun.

```sh
grpcurl -plaintext -d '{"title":"Hi","body":"there"}' \
  -import-path backend/proto -proto post.proto \
  localhost:50051 bevd.post.v1.PostService/CreatePost
```

## Tests

```sh
bun run test
```

Backend tests run against **PGlite** - a real Postgres compiled to WebAssembly, in this
process. No Docker, no port, nothing to clean up between runs, and the same
`drizzle/` migrations production uses. The gRPC tests bind a real port and call it with a
real client.

## Things that will bite you

- **Vitest runs its workers under Node, not Bun.** `typeof Bun === "undefined"` inside a
  test, so anything importing `Bun.password` or `bun:sqlite` explodes when a test touches
  it. Keep library code runtime-portable (`process.env`, not `Bun.env`) or switch to
  `bun test`.
- **`biome.jsonc`, not `biome.json`.** Biome treats a comment in `biome.json` as a parse
  error and then *silently falls back to defaults* - your rules look applied but are not.
- **Elysia's `.mount()` strips the path prefix**, so tRPC's fetch adapter is configured
  with `endpoint: ""`. Setting it to `"/trpc"` 404s every call. `.mount` is also what
  hands tRPC an intact request body; a plain `.all("/trpc/*")` route lets Elysia parse the
  body first and every mutation dies. See `src/app.ts`.
- **arktype's optional key means *absent*.** `{ limit: undefined }` is a present key with
  an invalid value and fails validation - spread the key in only when it has a value.
- **tRPC serializes with plain JSON**, so a `Date` from Drizzle arrives at the browser as
  an ISO **string**, and the inferred types say so. Add `superjson` as a transformer on
  both ends if you want real `Date`s back.
- **Biome lints a Vue SFC's `<script>` in isolation** and cannot see the `<template>`, so
  everything used only in markup looks unused. `noUnusedImports`/`noUnusedVariables` are
  off for `.vue` (see `biome.jsonc`) - `vue-tsc` catches the real thing.

## Scripts

| Script | Does |
| ------ | ---- |
| `bun run dev` | Backend and frontend together. |
| `bun run build` | Frontend only. The backend is not bundled - Bun runs the TypeScript, and so does the container. |
| `bun run start` | Boot the backend the way the container does. |
| `bun run test` | Vitest, both packages. |
| `bun run typecheck` | `tsc` + `vue-tsc`. |
| `bun run lint` / `lint:fix` | Biome (lint **and** format). |
| `bun run db:up` / `db:down` | Postgres via docker-compose. |
| `bun run db:generate` | New migration from a schema change. |
| `bun run db:push` | Push the schema straight to the DB (dev). |
| `bun run db:migrate` | Apply migrations (what production runs). |
| `bun run db:studio` | Drizzle Studio. |
| `bun run db:seed` | Sample data. |

Requires Bun >= 1.3.
