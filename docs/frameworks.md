# Frameworks in these templates

What each template runs on. Everything here is already in at least one template.

## Pick by

| You want | Take |
| --- | --- |
| An HTTP service, nothing else | `express-ts/base-backend` |
| An HTTP service with login | `express-ts/base-backend-jwt` or `-lacewing` |
| An HTTP service with login and a database | `express-ts/base-backend-jwt-prisma` |
| Three transports over one set of services | `bevd/base` |
| A frontend in the same repo | any `bevd/` template |

## Backend

### `express-ts/`: Node + Express

Node and Express, the stack most people already know.

| Layer | Choice | Notes |
| --- | --- | --- |
| Runtime | Node 24+ (`.nvmrc`) | |
| HTTP | [Express 5](https://expressjs.com) | v5 passes rejected async handlers to the error handler, so there is no `asyncHandler` wrapper. |
| Validation | [zod](https://zod.dev) v4 | Parses at the edge and returns the parsed type. |
| Errors | [http-errors](https://github.com/jshttp/http-errors) | Thrown status codes; one error middleware turns them into responses. |
| Security headers | [helmet](https://helmetjs.github.io) | CSP, HSTS, frame options. |
| CORS | [cors](https://github.com/expressjs/cors) | Origin allowlist. |
| Logging | [winston](https://github.com/winstonjs/winston) + `winston-daily-rotate-file` | Rotated files in `logs/`, with [morgan](https://github.com/expressjs/morgan) for the access log. |
| API docs | [@asteasolutions/zod-to-openapi](https://github.com/asteasolutions/zod-to-openapi) + [swagger-ui-express](https://github.com/scottie1984/swagger-ui-express) | Routes described in `src/openapi/` from the same zod schemas; Swagger UI at `/docs` outside production. |
| Config | Node's `--env-file` | `.env.development` in dev, `.env.production` for the build; real env vars win over both. Parsed by zod in `config/env.ts`. |

Auth templates add:

| Layer | Choice | Notes |
| --- | --- | --- |
| Tokens (`-jwt`, `-jwt-prisma`) | [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) | Both sign with HS256 and pin `algorithms: ["HS256"]` on verify. |
| Tokens (`-lacewing`) | [lacewing](https://github.com/Smiduweorc/lacewing) | RFC 8725 defaults that cannot be turned off: pinned algorithms, `typ` split between access and refresh, entropy-checked secrets, revocation, hardened cookies. |
| CSRF | [csrf-csrf](https://github.com/Psifi-Solutions/csrf-csrf) | Double submit. |
| Cookies | [cookie-parser](https://github.com/expressjs/cookie-parser) | Signed cookie parsing. `-lacewing` issues its token cookies through lacewing. |

`base-backend-jwt-prisma` adds:

| Layer | Choice | Notes |
| --- | --- | --- |
| Database | [Prisma](https://www.prisma.io) 7 + Postgres, over [@prisma/adapter-pg](https://www.prisma.io/docs/orm/overview/databases/postgresql) | No engine binary in Prisma 7; the pool is node-postgres' and its timeouts are in `config/env.ts`. Every query lives in `services/`. |
| Passwords | [argon2](https://github.com/ranisalt/node-argon2) | argon2id at the OWASP minimum, cost read from the environment so the tests can lower it. Prebuilt binaries. |
| Refresh tokens | 256 random bits, SHA-256 in a `refresh_tokens` row | Rotated on every refresh, single use by conditional update, whole family revoked on reuse. |

### `bevd/`: Bun + Elysia

Take this one if you want tRPC or gRPC as well as REST. See
[`bevd/README.md`](../bevd/README.md).

| Layer | Choice | Notes |
| --- | --- | --- |
| Runtime | [Bun](https://bun.sh) 1.3+ | Runs TypeScript directly; package manager and workspaces in one binary. |
| HTTP | [Elysia](https://elysiajs.com) | `.mount()`s the tRPC handler without an adapter. |
| RPC | [tRPC 11](https://trpc.io) | The frontend imports the router type; no client codegen. |
| RPC (service to service) | [@grpc/grpc-js](https://grpc.io/docs/languages/node/) | Separate port, HTTP/2, `.proto` files in `backend/proto/`. |
| Database | [Drizzle](https://orm.drizzle.team) + Postgres | Migrations in the repo, types inferred from the schema. |
| Validation | [arktype](https://arktype.io) | One schema is both tRPC's input parser and the service's argument type. |
| Logging | [pino](https://getpino.io) | JSON logs, `pino-pretty` in dev. |
| API docs | [@elysiajs/openapi](https://elysiajs.com/plugins/openapi.html) | Renders the document built in `src/openapi/`; its own route inference is off. |

## Frontend

Only the `bevd/` templates have one. It is a small working client.

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | [Vue 3](https://vuejs.org) | `<script setup>` + Composition API. |
| Build | [Vite](https://vite.dev) | Nothing configured beyond the Vue plugin. |
| API client | [@trpc/client](https://trpc.io/docs/client/vanilla) | `httpBatchLink` against the router the backend exports. Rename a Drizzle column and the frontend stops compiling. |
| Types | [vue-tsc](https://github.com/vuejs/language-tools) | Type-checks `.vue` files in CI and before build. |
| Tests | [Vitest](https://vitest.dev) + [@vue/test-utils](https://test-utils.vuejs.org) + [happy-dom](https://github.com/capricorn86/happy-dom) | Component tests without a browser. |
| Styling | plain CSS in `src/style.css` | Custom properties and a `prefers-color-scheme` block. |
| State | composables (`useAuth.ts` in `-lacewing`) | No Pinia. |

No vue-router, Pinia, component library or CSS framework. Add what you need. For the
auth version of the frontend, `bevd/base-lacewing/frontend` has login, the role-gated
admin UI and the browser half of double-submit CSRF in
[`src/lib/trpc.ts`](../bevd/base-lacewing/frontend/src/lib/trpc.ts).

## Shared tooling

| Concern | `express-ts/` | `bevd/` |
| --- | --- | --- |
| Lint | ESLint 10 (flat config) from [`standard/`](../standard); formatting via `.editorconfig` | [Biome](https://biomejs.dev) (`biome.jsonc`) |
| Tests | [Jest](https://jestjs.io) + ts-jest + [supertest](https://github.com/ladjs/supertest) | [Vitest](https://vitest.dev) + [PGlite](https://pglite.dev) (Postgres in-process) |
| Dev loop | `node --watch` + [tsx](https://tsx.is) loader | `bun --watch` |
| Git hooks | [lefthook](https://lefthook.dev) | lefthook |
| Commits | [commitlint](https://commitlint.js.org) + Conventional Commits | same |
| CI | GitHub Actions | GitHub Actions |
| Local services | none | docker-compose (Postgres 17) |

Why `bevd/` uses Biome is in [`bevd/README.md`](../bevd/README.md). Tabs, double quotes,
Conventional Commits and `.editorconfig` are the same on both sides.

## Not included

No queue, no cache, no auth provider SDK, no Kubernetes manifests, no Terraform, and no
ORM in `express-ts/` except the `-prisma` variant. They depend on what you are building
and what you already run; add them in your own repo.

[docs/expansion-candidates.md](./expansion-candidates.md) is the maintainer's list of what
might be added here.
