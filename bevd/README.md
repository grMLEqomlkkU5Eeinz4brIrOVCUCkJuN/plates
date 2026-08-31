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
Start from `base` if you are not sure; adding auth later means copying the `auth/`,
`http/`, `services/auth.service.ts` and `trpc/trpc.ts` pieces across, not restructuring
anything. `ServiceCtx` gains an `actor` field and nothing else moves.

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

```text
backend/
├── proto/          .proto definitions (gRPC)
└── src/
    ├── services/   business logic. Everything else is transport.
    │               context.ts defines the ServiceCtx every one of them takes.
    ├── trpc/       tRPC router, mounted on Elysia
    ├── grpc/       gRPC server, its own port (HTTP/2). handlers/ mirror the
    │               routers; wire.ts converts; unary.ts maps errors.
    ├── db/         Drizzle schema + migrations
    ├── auth/       policy, guards, jwt, password, tokens, sessions
    │               (auth templates only; base-lacewing's jwt rides lacewing)
    ├── http/       cookies (+ csrf in base-lacewing) - transport, not policy
    ├── lib/        errors and logger. Cross-cutting only.
    └── app.ts      Elysia: REST + tRPC + CORS + OpenAPI
frontend/           Vue 3 + Vite, tRPC client typed from the router
└── src/
    ├── composables/ everything that talks to the server
    ├── components/  markup and local form state
    └── lib/trpc.ts  the client itself. Imported by composables only.
```

Three layers, and the direction of the arrows is the point: `services/` may import from
`db/`, `auth/` and `lib/`, never from `trpc/`, `grpc/` or `http/`. Nothing enforces that
but the shape of `ServiceCtx` - a service is handed a database, a logger and (with auth)
an actor, so there is no Request in reach to be tempted by.

The organising idea, in every template: **services own the logic, transports only
translate.** Every service function has the same shape - `fn(ctx, input)` - and returns a
value or throws an `AppError`. tRPC turns that into an HTTP status; gRPC turns the same
error into a gRPC status. One rule, one place, two APIs - which is what keeps the
authorization checks in `base-jwt` honest across both.

The uniform signature is deliberate. Services that each took whichever of (db, log, actor)
they happened to need would mean adding a logger to one of them is a signature change
rippling through two transports and every test; with a `ServiceCtx` it is already there.
Both transports' context types are supersets of it, so a resolver passes itself straight
in - `listPosts(ctx, input)` - and the extra fields stay invisible to the service.

| Tool | Choice |
| --- | --- |
| Runtime | Bun >= 1.3 |
| Server | Elysia (REST + tRPC) and `@grpc/grpc-js` (gRPC, separate port) |
| Database | Postgres via Drizzle; docker-compose for dev |
| Validation | arktype - one schema serves tRPC's input parser *and* the service |
| Lint + format | Biome (`biome.jsonc`) |
| Tests | Vitest, against PGlite - a real Postgres, in-process, no Docker |

## Before production

[`PRODUCTION.md`](./PRODUCTION.md) is the list of what these templates deliberately do not
do - rate limiting, TLS, metrics, refresh token reuse detection - and which of those your
platform probably already handles for you. Read it before the first deploy, not after.

## Notes

These templates use **Biome**, not the ESLint setup in [`standard/`](../standard),
because Biome is one binary, does not fight Bun, and is what the upstream
[bevd](https://github.com/grMLEqomlkkU5Eeinz4brIrOVCUCkJuN/bevd) project already used. They
keep the rest of the house style: tabs, double quotes, Conventional Commits, lefthook,
`.editorconfig`, and a CI workflow.

Each template's README ends with a "things that will bite you" section. Read it - it is
the list of footguns found while building them (Elysia's `.mount()` prefix stripping,
Biome silently ignoring a commented `biome.json`, Vitest running under Node rather than
Bun), and every one of them fails quietly.
