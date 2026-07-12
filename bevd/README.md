# bevd

**B**un + **E**lysia + **V**ue + **D**rizzle. Two full-stack templates, differing only in
whether they have auth.

| Template | Auth | Use it when |
| --- | --- | --- |
| [`base`](./base) | none | Nothing to log into - an internal tool, a public API, a prototype. |
| [`base-jwt`](./base-jwt) | JWT + roles | Users, sessions, and "only the author or an admin may touch this". |

`base-jwt` **is** `base` with authentication layered on. Start from `base` if you are not
sure; adding auth later means copying the `lib/`, `services/auth.service.ts` and
`trpc/trpc.ts` pieces across, not restructuring anything.

Both ship the same three ways in - **REST**, **tRPC** and **gRPC** - over one set of
services, plus a Vue 3 frontend that talks tRPC with end-to-end type inference.

## Grab one

```sh
npx degit grMLEqomlkkU5Eeinz4brIrOVCUCkJuN/plates/bevd/base my-app
cd my-app
git init
bun install
```

Swap `base` for `base-jwt` if you want auth. Then follow that template's README.

## What is in the box

```
backend/
├── proto/          .proto definitions (gRPC)
└── src/
    ├── services/   business logic. Everything else is transport.
    ├── trpc/       tRPC router, mounted on Elysia
    ├── grpc/       gRPC server, its own port (HTTP/2)
    ├── db/         Drizzle schema + migrations
    ├── lib/        errors, logger (+ jwt, password, cookies, actor in base-jwt)
    └── app.ts      Elysia: REST + tRPC + CORS + OpenAPI
frontend/           Vue 3 + Vite, tRPC client typed from the router
```

The organising idea, in both templates: **services own the logic, transports only
translate.** A service takes a database, an actor and an input, then returns a value or
throws an `AppError`. tRPC turns that into an HTTP status; gRPC turns the same error into
a gRPC status. One rule, one place, two APIs - which is what keeps the authorization
checks in `base-jwt` honest across both.

| Tool | Choice |
| --- | --- |
| Runtime | Bun >= 1.3 |
| Server | Elysia (REST + tRPC) and `@grpc/grpc-js` (gRPC, separate port) |
| Database | Postgres via Drizzle; docker-compose for dev |
| Validation | arktype - one schema serves tRPC's input parser *and* the service |
| Lint + format | Biome (`biome.jsonc`) |
| Tests | Vitest, against PGlite - a real Postgres, in-process, no Docker |

## Notes

These templates use **Biome**, not the ESLint + Prettier setup in [`standard/`](../standard),
because Biome is one binary, does not fight Bun, and is what the upstream
[bevd](https://github.com/grMLEqomlkkU5Eeinz4brIrOVCUCkJuN/bevd) project already used. They
keep the rest of the house style: tabs, double quotes, Conventional Commits, lefthook,
`.editorconfig`, and a CI workflow.

Each template's README ends with a "things that will bite you" section. Read it - it is
the list of footguns found while building them (Elysia's `.mount()` prefix stripping,
Biome silently ignoring a commented `biome.json`, Vitest running under Node rather than
Bun), and every one of them fails quietly.
