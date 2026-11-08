# Expansion candidates

For the maintainer. What could be added to `plates`, what each is worth, and what it
costs to carry. Nothing here is committed to.

Tier 1 makes the templates that already exist more useful without adding a template.
Everything after it adds more to maintain.

## The cost

The templates are near-copies of each other. `express-ts/` alone is one stack times four
auth and storage variants. Every dimension added as a folder multiplies that; a dimension
added as a documented diff does not.

| The addition changes | Ship it as |
| --- | --- |
| The framework or runtime (Express to Fastify) | A new template folder |
| The auth model (none, JWT, lacewing) | A new template folder (the current pattern) |
| A layer on top (database, Redis, tracing, queue) | A guide in `docs/` plus one reference template that has it |

Otherwise Tier 1 turns into dozens of folders that drift apart.

## Tier 1: gaps in what already ships

| Candidate | Fills | Notes |
| --- | --- | --- |
| [Drizzle](https://orm.drizzle.team) in `express-ts/` | Only `base-backend-jwt-prisma` has a database; the others keep users in an in-memory `Map`. | Same ORM as `bevd/`, so one to document. It would share everything with the Prisma template except `db/`, `services/` and the migrations. |
| [Prisma](https://www.prisma.io) | The same gap, for people who ask for it by name. | Done: `express-ts/base-backend-jwt-prisma`. Prisma 7 has no engine binary; what remains is the codegen step. |
| [Kysely](https://kysely.dev) | The same gap, for people who want a query builder and no ORM. | Cheapest to document, least asked for. |
| [ioredis](https://github.com/redis/ioredis) | `base-backend-lacewing` uses lacewing's `MemoryRevocationStore`: revocations are lost on restart and never reach a second replica. That is a bug as soon as the service runs more than one process. | A `RedisRevocationStore` is a small adapter. The same Redis would serve rate limiting below. |
| [OpenTelemetry](https://opentelemetry.io/docs/languages/js/) | No distributed tracing, in templates meant for microservices. | `@opentelemetry/sdk-node` + `auto-instrumentations-node` instruments Express, HTTP and pg with little code. Pair with Jaeger or Tempo in `docker-compose.yml`. |
| [prom-client](https://github.com/siimon/prom-client) | No `/metrics`. | Small; sits next to the health route. |
| [rate-limiter-flexible](https://github.com/animir/node-rate-limiter-flexible) | No rate limiting outside `base-backend-jwt-prisma`, including on the auth routes. | Backs onto the same Redis, so limits are shared across replicas, which `express-rate-limit` does not do by default. |
| [Vitest](https://vitest.dev) replacing Jest + ts-jest in `express-ts/` | Jest + ts-jest is the slowest and most fragile part of those templates, and the ESM transform config breaks when a dependency ships ESM only. `bevd/` already uses Vitest. | A migration: `supertest` works unchanged and most `@jest/globals` imports become `vitest` imports. Removes ts-jest, ts-node and a config file. |
| [Testcontainers](https://node.testcontainers.org) | Database tests need a real database. | `bevd/` uses PGlite, which is better where it fits. Testcontainers covers Redis and whatever PGlite cannot emulate. |

The OpenAPI row is done: the `express-ts` templates build their document from the zod
schemas with `@asteasolutions/zod-to-openapi`, and `swagger-jsdoc` is gone.

## Tier 2: new backend template families

| Candidate | Case for | Case against |
| --- | --- | --- |
| [Fastify](https://fastify.dev) | The obvious sibling to Express and the most likely request. pino and schema validation built in, `@fastify/swagger` generates OpenAPI from the route schema, and `fastify-type-provider-zod` keeps the existing zod. Encapsulated plugins suit a service better than Express middleware ordering. | Little. Do this one first. |
| [Hono](https://hono.dev) | Runs on Node, Bun, Deno, Workers and Lambda from one codebase, the only candidate covering edge and serverless deploys. Web-standard `Request`/`Response`, and its RPC mode gives tRPC-style client types without tRPC. | Fewer of the middlewares people expect (sessions, CSRF). Overlaps Elysia on Bun; the reason to add it is portability. |
| [NestJS](https://nestjs.com) | Asked for by name. `@nestjs/microservices` has TCP, Redis, NATS, RabbitMQ, Kafka and gRPC transports behind one interface. DI makes "services own the logic" structural. | Contradicts the thinness the README promises: decorators, modules, a CLI, a lot more to keep updated. If it lands, as its own family with its own README, not a fifth `express-ts/` sibling. |
| [Effect](https://effect.website) + `@effect/platform` | Typed errors in the signature, structured concurrency, DI and retries in the language. | Steep. A template is a bad place to teach a paradigm, and few people grabbing a service template want one. |
| Go ([chi](https://go-chi.io)) or Rust ([axum](https://github.com/tokio-rs/axum)) | Fleets are not all TypeScript, and the `.proto` files in `bevd/` are language-neutral already. | Shares none of `standard/`, lefthook, npm or the CI workflow. Only worth it as a separate tree with its own tooling. |

## Tier 3: messaging and jobs

Every template is request/response only. Services in a fleet also talk asynchronously.

| Candidate | Take it when |
| --- | --- |
| [BullMQ](https://docs.bullmq.io) | First. Redis-backed jobs, retries and scheduling, on the Redis from Tier 1. Covers the common case: email, webhooks, anything slow. |
| [NATS](https://nats.io) / JetStream | Second. A light inter-service event bus: one small binary in compose, subject-based routing. |
| [kafkajs](https://kafka.js.org) | Only for event sourcing. Heavy to run in a template's compose file. |
| [amqplib](https://amqp-node.github.io/amqplib/) (RabbitMQ) | Same tier as Kafka. Prefer it to Kafka for task routing over a log. |

## Tier 4: frontend

`bevd/` is Vue only.

| Candidate | Case for |
| --- | --- |
| React + Vite + [TanStack Query](https://tanstack.com/query) | A second client against the same tRPC router, in the same template, with the backend unchanged. `@trpc/tanstack-react-query` is the common path. |
| [Nuxt](https://nuxt.com) | SSR, routing and data fetching for people who outgrow the Vue SPA. |
| [SvelteKit](https://svelte.dev/docs/kit) | Only if there is appetite for a third framework. Smaller audience than the two above. |
| [Tailwind](https://tailwindcss.com) v4 | Plain `style.css` stays the default, but Tailwind is a common ask and v4 needs no config file, so the diff is small. |
| vue-router + [Pinia](https://pinia.vuejs.org) | Keep them out of the base and show the diff in a guide. |
| [Playwright](https://playwright.dev) | No end-to-end test crosses the frontend/backend boundary, the one most likely to break. |

## Tier 5: auth and authorization

Next to lacewing, so these would also demo it.

| Candidate | Fills |
| --- | --- |
| [CASL](https://casl.js.org) or [Casbin](https://casbin.org) | `bevd/base-jwt` hand-writes "author or admin". CASL for TS; Casbin if policies must live outside the code. |
| [openid-client](https://github.com/panva/node-openid-client) | Nothing federates. "Log in with your company IdP" is the usual next request after passwords. lacewing would hold the session afterwards. |
| [SimpleWebAuthn](https://simplewebauthn.dev) | Passkeys, issuing the same lacewing session the password flow does. |
| [Better Auth](https://better-auth.com) or [Lucia](https://lucia-auth.com) | Session-based auth, for contrast with the JWT templates. Not every service should use JWTs. |

## Tier 6: contracts between services

| Candidate | Fills |
| --- | --- |
| gRPC in `express-ts/` | `bevd/` has it; the `express-ts` templates have no service-to-service transport. |
| [Pact](https://docs.pact.io) | Consumer-driven contract tests: check service A's assumptions about B without booting both. Nothing in the repo covers this. |
| [Pothos](https://pothos-graphql.dev) + [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server) | No GraphQL anywhere. Code-first and typed. Better as a BFF template than a per-service default. |
| [AsyncAPI](https://www.asyncapi.com) | Only after Tier 3; it documents events, and there are none yet. |

## Not recommended

- Kubernetes manifests, Helm, Terraform. The README says these are out of scope. If they
  ever land, put them in a `deploy/` example outside every template.
- A `create-plates` CLI. A second product to maintain; `degit` already works and needs no
  release.
- Deno. Bun and Hono cover most of it here.

## If only three things get done

1. Drizzle in `express-ts/`, so the non-Prisma templates have a database.
2. Redis-backed revocation. The in-memory store is wrong in production and the fix is small.
3. OpenTelemetry, the one addition specific to running a fleet of services.
