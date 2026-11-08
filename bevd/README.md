# bevd

Bun + Elysia + Vue + Drizzle. Three full-stack templates that differ in how much auth
they carry. Each serves REST, tRPC and gRPC over one set of services, with a Vue 3
frontend that calls tRPC with types inferred from the router.

| Template | Auth | Use it when |
| --- | --- | --- |
| [`base`](./base) | none | Nothing to log into: an internal tool, a public API, a prototype. |
| [`base-jwt`](./base-jwt) | JWT + roles | Users, sessions, and "only the author or an admin may touch this". |
| [`base-lacewing`](./base-lacewing) | JWT via [lacewing](https://github.com/Smiduweorc/lacewing) + roles + CSRF | `base-jwt` with the token handling done by lacewing, plus double-submit CSRF through to the Vue client. |

`base-jwt` is `base` with auth added, and `base-lacewing` is `base-jwt` with the
hand-written JWT code replaced by lacewing plus a CSRF layer. If you are not sure, start
from `base`. Adding auth later means copying `auth/`, `http/`,
`services/auth.service.ts` and `trpc/trpc.ts` across; `ServiceCtx` gains an `actor` field
and nothing else moves.

## Grab one

```sh
npx degit grMLEqomlkkU5Eeinz4brIrOVCUCkJuN/plates/bevd/base my-app
cd my-app
git init
bun install
```

Swap `base` for `base-jwt` or `base-lacewing` if you want auth, then follow that
template's README. Requires Bun 1.3 or later.

## Layout

- `backend/src/services/`: the business logic. `context.ts` defines the `ServiceCtx`
  every service takes.
- `backend/src/trpc/`, `rest/`, `grpc/`: transports. gRPC runs on its own port.
- `backend/src/db/`: Drizzle schema; migrations are in `backend/drizzle/`.
- `backend/src/auth/`, `http/`: auth and cookies, in the auth templates only.
- `frontend/src/composables/`: everything that talks to the server.
  `frontend/src/lib/trpc.ts` is the client, imported only by composables.

`services/` may import from `db/`, `auth/` and `lib/`, never from `trpc/`, `grpc/` or
`http/`. Nothing enforces that except `ServiceCtx`: a service gets a database, a logger
and (with auth) an actor, and no Request.

Every service function is `fn(ctx, input)` and returns a value or throws an `AppError`.
tRPC turns that into an HTTP status, gRPC into a gRPC status, so an authorization check
in `base-jwt` is written once and applies to both. Both transports' context types extend
`ServiceCtx`, so a resolver passes itself in (`listPosts(ctx, input)`), and adding a
logger to one service does not change both transports and every test.

Validation is arktype: one schema is both tRPC's input parser and the service's. Tests
are Vitest against PGlite (Postgres in-process, no Docker).

## Notes

These use Biome, not the ESLint setup in [`standard/`](../standard), because Biome is one
binary, works with Bun, and is what the upstream
[bevd](https://github.com/grMLEqomlkkU5Eeinz4brIrOVCUCkJuN/bevd) project used. The rest
of the house style is the same: tabs, double quotes, Conventional Commits, lefthook,
`.editorconfig` and a CI workflow.

Each template's README ends with "Things that will bite you": Elysia's `.mount()` prefix
stripping, Biome ignoring a commented `biome.json`, Vitest running under Node instead of
Bun. None of them gives a clear error.

Before the first deploy, read [`PRODUCTION.md`](./PRODUCTION.md).
