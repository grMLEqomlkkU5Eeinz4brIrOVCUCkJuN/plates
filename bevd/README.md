# bevd

**B**un + **E**lysia + **V**ue + **D**rizzle. Three full-stack templates, differing only
in how much auth they carry.

| Template | Auth | Use it when |
| --- | --- | --- |
| [`base`](./base) | none | Nothing to log into - an internal tool, a public API, a prototype. |
| [`base-jwt`](./base-jwt) | JWT + roles | Users, sessions, and "only the author or an admin may touch this". |
| [`base-lacewing`](./base-lacewing) | JWT via [lacewing](https://github.com/Smiduweorc/lacewing) + roles + CSRF | `base-jwt`, with the token lifecycle enforced by lacewing (profiles, `typ` pinning, entropy-checked secrets, hardened cookies) and double-submit CSRF wired through to the Vue client. Also a working lacewing demo. |

`base-jwt` **is** `base` with authentication layered on, and `base-lacewing` **is**
`base-jwt` with the hand-rolled JWT plumbing replaced by lacewing plus a CSRF layer.
Start from `base` if you are not sure; adding auth later means copying the `lib/`,
`services/auth.service.ts` and `trpc/trpc.ts` pieces across, not restructuring anything.

All ship the same three ways in - **REST**, **tRPC** and **gRPC** - over one set of
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
    ├── lib/        errors, logger (+ jwt, password, cookies, actor in the auth
    │               templates; base-lacewing's jwt/cookies ride lacewing, + csrf)
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
