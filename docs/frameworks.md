# Frameworks in these templates

What each template actually runs on, and why that one. If you are deciding whether a
template fits, read the "Pick by" column first; if you are already inside one, the rest
of the page is the inventory.

Everything here is already wired up in at least one template - this is not a shopping
list of things you could add.

## Pick by

| You want | Take |
| --- | --- |
| An HTTP service, nothing else | `express-ts/base-backend` |
| An HTTP service with login | `express-ts/base-backend-jwt` or `-lacewing` |
| Three transports over one set of services | `bevd/base` |
| A frontend in the same repo | any `bevd/` template |

## Backend

### `express-ts/` - Node + Express

The conservative option. Boring on purpose: it is the stack most people can already read,
and the one most hosting, tracing and APM vendors document first.

| Layer | Choice | Why this one |
| --- | --- | --- |
| Runtime | Node >= 24 (`.nvmrc`) | Native TS type-stripping, stable `node:test`-era tooling, LTS support horizon. |
| HTTP | [Express 5](https://expressjs.com) | v5 finally propagates async route rejections to the error handler, which is what makes the no-`asyncHandler` templates possible. |
| Validation | [zod](https://zod.dev) v4 | Parses at the edge and gives the parsed type back, so handlers never re-check shapes. |
| Errors | [http-errors](https://github.com/jshttp/http-errors) | Status codes as throwable values; one error middleware turns them into responses. |
| Security headers | [helmet](https://helmetjs.github.io) | CSP, HSTS, frame options - the set you would otherwise hand-roll wrong. |
| CORS | [cors](https://github.com/expressjs/cors) | Origin allowlist; matters as soon as a browser talks to the service. |
| Logging | [winston](https://github.com/winstonjs/winston) + `winston-daily-rotate-file` | Structured logs to `logs/`, rotated, with [morgan](https://github.com/expressjs/morgan) feeding it the access log. |
| API docs | [swagger-jsdoc](https://github.com/Surnet/swagger-jsdoc) + [swagger-ui-express](https://github.com/scottie1984/swagger-ui-express) | OpenAPI generated from JSDoc next to the route, so it rots slower than a separate spec file. |
| Config | Node's native `--env-file` | `.env.development` in dev, `.env.production` for the built artefact; real env vars still win over both. Parsed by [zod](https://zod.dev) in `config/env.ts`. |

Auth templates add:

| Layer | Choice | Why this one |
| --- | --- | --- |
| Tokens (`-jwt`) | [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) | The default. Safe if you pin `algorithms` on verify - the templates do. |
| Tokens (`-lacewing`) | [lacewing](https://github.com/Smiduweorc/lacewing) | RFC 8725 defaults you cannot switch off: pinned algorithms, `typ` split between access and refresh, entropy-checked secrets, revocation, hardened cookies. |
| CSRF | [csrf-csrf](https://github.com/Psifi-Solutions/csrf-csrf) | Double-submit, which is the pattern that survives cookie-based auth. |
| Cookies | [cookie-parser](https://github.com/expressjs/cookie-parser) | Signed cookie parsing. `-lacewing` issues cookies through lacewing instead. |

### `bevd/` - Bun + Elysia

The fast option, and the one to take if you want more than REST. See [`bevd/README.md`](../bevd/README.md).

| Layer | Choice | Why this one |
| --- | --- | --- |
| Runtime | [Bun](https://bun.sh) >= 1.3 | Runs TypeScript directly; the package manager, test runner and workspace tooling are one binary. |
| HTTP | [Elysia](https://elysiajs.com) | Built for Bun, end-to-end typed, and `.mount()`s the tRPC and gRPC handlers without an adapter layer. |
| RPC | [tRPC 11](https://trpc.io) | The frontend imports the router *type* - no client codegen, no drift. |
| RPC (service-to-service) | [@grpc/grpc-js](https://grpc.io/docs/languages/node/) | Separate port, HTTP/2, `.proto` in `backend/proto/`. What another microservice calls. |
| Database | [Drizzle](https://orm.drizzle.team) + Postgres | SQL you can read, migrations in the repo, types inferred from the schema. |
| Validation | [arktype](https://arktype.io) | One schema is both tRPC's input parser and the service's argument type. |
| Logging | [pino](https://getpino.io) | JSON logs, fastest of the Node-compatible loggers, `pino-pretty` in dev. |
| API docs | [@elysiajs/openapi](https://elysiajs.com/plugins/openapi.html) | OpenAPI derived from the route schemas rather than written by hand. |

## Frontend

Only the `bevd/` templates ship one. It is deliberately small - a working client, not a
starter app.

| Layer | Choice | Why this one |
| --- | --- | --- |
| Framework | [Vue 3](https://vuejs.org) | `<script setup>` + Composition API. Enough structure for a real UI, small enough to read in one sitting. |
| Build | [Vite](https://vite.dev) | Dev server, HMR, production build. Nothing configured beyond the Vue plugin. |
| API client | [@trpc/client](https://trpc.io/docs/client/vanilla) | `httpBatchLink` against the same router the backend exports. Rename a Drizzle column and the frontend stops compiling. |
| Types | [vue-tsc](https://github.com/vuejs/language-tools) | Type-checks `.vue` files in CI and before build. |
| Tests | [Vitest](https://vitest.dev) + [@vue/test-utils](https://test-utils.vuejs.org) + [happy-dom](https://github.com/capricorn86/happy-dom) | Component tests without a browser. |
| Styling | plain CSS in `src/style.css` | CSS custom properties and a `prefers-color-scheme` block. No framework to rip out. |
| State | Composition API composables (`useAuth.ts` in `-lacewing`) | Pinia is one dependency away if you outgrow it; nothing here needs it yet. |

Deliberately absent: **vue-router**, **Pinia**, a component library, and any CSS framework.
Each is a decision that belongs to your app, and each is easier to add than to remove.
If you want the auth version of the frontend, `bevd/base-lacewing/frontend` has login,
role-gated admin UI and the browser half of double-submit CSRF in
[`src/lib/trpc.ts`](../bevd/base-lacewing/frontend/src/lib/trpc.ts).

## Shared tooling

| Concern | `express-ts/` | `bevd/` |
| --- | --- | --- |
| Lint | ESLint 10 (flat config), from [`standard/`](../standard); formatting via `.editorconfig` | [Biome](https://biomejs.dev) (`biome.jsonc`) |
| Tests | [Jest](https://jestjs.io) + ts-jest + [supertest](https://github.com/ladjs/supertest) | [Vitest](https://vitest.dev) + [PGlite](https://pglite.dev) (real Postgres, in-process) |
| Dev loop | `node --watch` + [tsx](https://tsx.is) loader | `bun --watch` |
| Git hooks | [lefthook](https://lefthook.dev) | lefthook |
| Commits | [commitlint](https://commitlint.js.org) + Conventional Commits | same |
| CI | GitHub Actions | GitHub Actions |
| Local services | - | docker-compose (Postgres 17) |

The split exists because Biome is one binary and does not fight Bun; the reasoning is in
[`bevd/README.md`](../bevd/README.md). Everything else - tabs, double quotes, Conventional
Commits, `.editorconfig` - is the same on both sides.

## Not here, on purpose

No queue, no cache, no ORM in the `express-ts/` templates, no auth provider SDK, no
Kubernetes manifests, no Terraform. These are the pieces where the right answer depends
entirely on what you are building and what you already run, and a template that guesses
wrong costs more than one that stays quiet. Add them in your own repo, after you have
grabbed the template.

Some of them may still arrive here eventually -
[docs/expansion-candidates.md](./expansion-candidates.md) is the maintainer-facing list of
what is being weighed and why.
