# Expansion candidates

Maintainer-facing. What could be added to `plates`, what each is actually worth, and what
it costs to carry. Nothing here is committed to - it is a list to argue with.

The ordering is deliberate: everything in Tier 1 makes templates that **already exist**
more useful, without adding a template. Everything below it adds surface area.

## The cost that governs all of this

There are eight templates and they are near-copies. `express-ts/` alone is one stack x
three auth choices x two error-handling styles. Every orthogonal dimension you add as a
*folder* multiplies that; every dimension you add as a *documented diff* does not.

So the rule worth holding to:

| The addition changes... | Ship it as |
| --- | --- |
| The framework or runtime (Express -> Fastify) | A new template folder |
| The auth model (none -> JWT -> lacewing) | A new template folder (already the pattern) |
| A layer bolted on (database, Redis, tracing, queue) | A guide in `docs/` + one reference template that has it |

Otherwise Tier 1 turns into 32 folders that all drift apart.

## Tier 1 - holes in what already ships

These fix things a reader will notice on day one.

| Candidate | Fills | Notes |
| --- | --- | --- |
| **[Drizzle](https://orm.drizzle.team) in `express-ts/`** | There is no database. `models/user.model.ts` is a zod schema plus in-memory helpers, so every template stops being useful at the exact moment a real service starts. | Biggest single gap in the repo. Use Drizzle rather than Prisma for consistency with `bevd/` - one ORM to document, and the schema-first mental model already appears in the other half of the repo. |
| **[Prisma](https://www.prisma.io)** | The same gap, for the audience that will ask for it by name. | Landed first, as `express-ts/base-backend-jwt-prisma`, before the Drizzle variant did. Prisma 7 dropped the engine binary, which removed most of the weight this row used to warn about; what remains is the codegen step. A Drizzle sibling would share everything but `db/`, `services/` and the migrations. |
| **[Kysely](https://kysely.dev)** | The same gap, for people who want a query builder and no ORM. | Cheapest of the three to document. Weakest pull. |
| **[ioredis](https://github.com/redis/ioredis)** | `base-backend-lacewing` uses lacewing's `MemoryRevocationStore`: revoked tokens come back on restart, and never propagate to a second replica. That is a correctness bug the moment the service scales past one process. | Highest value-per-line in the list. A `RedisRevocationStore` is a small adapter, and it doubles as the lacewing demo that shows why the store is an interface. Also unlocks rate limiting and cache below. |
| **[OpenTelemetry](https://opentelemetry.io/docs/languages/js/)** | The templates are for microservices and have no distributed tracing. Trace context is the thing that makes a *fleet* debuggable rather than a single service. | `@opentelemetry/sdk-node` + `auto-instrumentations-node` gets Express, HTTP and pg instrumented with roughly no code. Pair with Jaeger or Tempo in a `docker-compose.yml`. Strong candidate for the most "this is a microservice template" addition available. |
| **[prom-client](https://github.com/siimon/prom-client)** | No `/metrics`. | Small, conventional, pairs with the existing health route. |
| **[rate-limiter-flexible](https://github.com/animir/node-rate-limiter-flexible)** | No rate limiting anywhere, including on the auth routes, which is where it matters most. | Prefer it over `express-rate-limit` because it backs onto the same Redis you added above, so limits are shared across replicas. |
| **[Vitest](https://vitest.dev) replacing Jest + ts-jest in `express-ts/`** | Jest + ts-jest is the slowest and most fragile part of those templates, and the ESM transform config is a known sharp edge when a dependency ships ESM-only. `bevd/` already uses Vitest. | A migration, not an addition - `supertest` works unchanged and most `@jest/globals` imports become `vitest` imports. Removes ts-jest, ts-node and a config file. Worth doing for the maintenance saving alone. |
| **[Testcontainers](https://node.testcontainers.org)** | Once there is a database, the tests need a real one. | `bevd/` solved this with PGlite, which is better where it fits. Testcontainers is the answer for Redis, and for anything PGlite cannot emulate. |
| **[zod-openapi](https://github.com/samchungy/zod-openapi)** | `swagger-jsdoc` reads JSDoc comments that sit next to a zod schema saying the same thing twice. They drift, silently, and the doc is the copy that lies. | Generate the OpenAPI document from the zod schemas already being written. Deletes a whole class of rot, and removes `swagger-jsdoc` + its types. |

## Tier 2 - new backend template families

Ranked by demand-to-effort, and each one is a genuinely new folder.

| Candidate | Case for | Case against |
| --- | --- | --- |
| **[Fastify](https://fastify.dev)** | The obvious sibling to Express and the most likely single request. Roughly 2-3x Express throughput, pino and schema validation built in rather than bolted on, `@fastify/swagger` generates OpenAPI from the route schema, and `fastify-type-provider-zod` keeps the zod already in use while typing handlers off it. The plugin/encapsulation model is a better fit for a microservice than Express middleware ordering. | Almost none. Start here. |
| **[Hono](https://hono.dev)** | Runs on Node, Bun, Deno, Workers and Lambda from one codebase - the only candidate that covers edge and serverless deploys, which nothing in the repo currently does. Web-standard `Request`/`Response`, tiny, and its RPC mode gives tRPC-style client inference without tRPC. | Smaller ecosystem for the middleware people expect (sessions, CSRF). Overlaps Elysia on Bun - the differentiator to write about is *portability*, not speed. |
| **[NestJS](https://nestjs.com)** | The template people ask for by name in this exact category. `@nestjs/microservices` ships transports for TCP, Redis, NATS, RabbitMQ, Kafka and gRPC behind one interface, which is a stronger microservice story than anything currently in the repo. DI makes the service-owns-the-logic rule structural instead of a convention. | Directly contradicts the thinness the README now promises: decorators, modules, a CLI, and a much larger thing to keep updated. Worth doing precisely *because* it is the requested one, but it should be its own family with its own README rather than a fourth `express-ts/` sibling. |
| **[Effect](https://effect.website) + `@effect/platform`** | Typed errors in the signature, structured concurrency, dependency injection and retries as language rather than libraries. A real answer to the error-handling question the `asyncHandler` vs no-`asyncHandler` split is dancing around. | Steep. A template is a bad place to teach a paradigm, and the audience overlap with "grab a microservice template" is thin. Interesting, not urgent. |
| **Go ([chi](https://go-chi.io)) or Rust ([axum](https://github.com/tokio-rs/axum))** | Real microservice fleets are not all TypeScript, and the gRPC contracts in `bevd/proto/` are language-neutral already. | Breaks everything shared: `standard/`, lefthook, npm, the CI workflow, the whole tooling story. Only worth it as a deliberate second repo-within-a-repo, not as one more folder. |

## Tier 3 - messaging and jobs

The gap that most undercuts the "microservices" claim: every template today is
request/response only. Services in a fleet talk asynchronously.

| Candidate | Take it when |
| --- | --- |
| **[BullMQ](https://docs.bullmq.io)** | First. Redis-backed jobs, retries, scheduling, and it reuses the Redis from Tier 1. The most common real need (email, webhooks, anything slow). |
| **[NATS](https://nats.io) / JetStream** | Second. The lightest credible inter-service event bus - one small binary in compose, subject-based routing, and it fits the fleet shape these templates imply better than a broker with a management UI. |
| **[kafkajs](https://kafka.js.org)** | Only for the event-sourcing/enterprise audience. Heavy to run in a template's compose file. |
| **[amqplib](https://amqp-node.github.io/amqplib/) (RabbitMQ)** | Same tier as Kafka. Take it over Kafka if the target is classic task routing rather than a log. |

## Tier 4 - frontend

`bevd/` is Vue-only, which caps the audience of the frontend addition people asked for.

| Candidate | Case for |
| --- | --- |
| **React + Vite + [TanStack Query](https://tanstack.com/query)** | The cheapest large win in the repo: a *second client* against the same tRPC router, in the same template, sharing the backend unchanged. `@trpc/tanstack-react-query` is the well-trodden path, and it demonstrates the end-to-end typing claim harder than one client can. |
| **[Nuxt](https://nuxt.com)** | The natural upgrade path for the Vue frontend that exists - SSR, routing and data fetching for the people who outgrow the SPA. |
| **[SvelteKit](https://svelte.dev/docs/kit)** | Only if there is appetite for a third framework. Lovely, smaller audience than the two above. |
| **[Tailwind](https://tailwindcss.com) v4** | The `style.css` approach is the right default for a template, but a documented Tailwind variant is a common ask and v4's config-free setup makes it a small diff. |
| **vue-router + [Pinia](https://pinia.vuejs.org) variant** | `docs/frameworks.md` says both are deliberately absent. Keep them absent from the base and show the diff in a guide - that is the honest version of "one dependency away". |
| **[Playwright](https://playwright.dev)** | No end-to-end test crosses the frontend/backend boundary today, which is the boundary most likely to break. |

## Tier 5 - auth and authorization

Adjacent to lacewing, so these double as demos of it.

| Candidate | Fills |
| --- | --- |
| **[CASL](https://casl.js.org) or [Casbin](https://casbin.org)** | `bevd/base-jwt` hand-rolls "author or admin". Real services outgrow that within weeks. CASL is the more idiomatic TS fit; Casbin if policies must live outside the code. |
| **[openid-client](https://github.com/panva/node-openid-client)** | Nothing federates. "Log in with your company IdP" is the most common auth request after passwords. Certified, and pairs cleanly with lacewing holding the session afterwards. |
| **[SimpleWebAuthn](https://simplewebauthn.dev)** | Passkeys. Increasingly expected, and there is a good story in showing them issuing the same lacewing session the password flow does. |
| **[Better Auth](https://better-auth.com) or [Lucia](https://lucia-auth.com)** | The session-based counterpoint to the JWT templates. Useful as an honest contrast: not every service should be using JWTs, and a template family that only shows JWTs quietly implies otherwise. |

## Tier 6 - contracts between services

| Candidate | Fills |
| --- | --- |
| **gRPC in `express-ts/`** | `bevd/` has it, `express-ts/` does not, so the Node-side templates have no service-to-service transport at all. |
| **[Pact](https://docs.pact.io)** | Consumer-driven contract testing - verifying service A's assumptions about B without booting the fleet. The testing story that is specific to microservices, and the repo has nothing in the category. |
| **[Pothos](https://pothos-graphql.dev) + [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server)** | No GraphQL anywhere. Code-first and type-safe, so it fits the repo's typing claims better than a schema-first server would. Best framed as a BFF template rather than a per-service default. |
| **[AsyncAPI](https://www.asyncapi.com)** | Only once Tier 3 lands - it documents the events, and documenting events nobody publishes is premature. |

## Deliberately not recommended

- **Kubernetes manifests, Helm, Terraform.** The README promises these are out of scope, and that promise is worth more than the manifests. If they ever land, they belong in a `deploy/` example that is clearly not part of any template.
- **A `create-plates` CLI.** Tempting, and it is a second product to maintain. `degit` already works and needs no release process.
- **Deno.** Little that Bun and Hono do not already cover here.

## If only three things get done

1. **A database in `express-ts/`** (Drizzle) - without it the templates stop where real work starts.
2. **Redis-backed revocation** - the current in-memory store is wrong in production, and it is a small fix.
3. **OpenTelemetry** - the one addition that makes these read as microservice templates rather than as small servers.
