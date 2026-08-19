# Before you ship this

Everything on this list is missing from the templates on purpose.

A template that picks your rate limiter has decided you are not behind Envoy. One that
ships a `/metrics` endpoint has decided you run Prometheus and not OpenTelemetry. One that
terminates TLS has decided you are not behind a load balancer that already did. Those are
deployment decisions, and they belong to whoever is deploying - which is you, not this
repository.

So the code stops at the point where the next choice would be yours. The seam is clean
enough that adding any of this later is additive rather than surgery, and that is the whole
bargain: you get less, and what you get does not have to be undone.

The useful split is not "important" versus "nice to have". It is **whether the thing can be
done outside the application at all.**

---

## Usually not the application's job

In a service mesh, behind an API gateway, or behind any reverse proxy worth its config
file, these are solved problems one layer up. Tick them off by pointing at the thing that
already handles them. If nothing does, they fall back to you and belong in the list below
this one.

- [ ] **Rate limiting on `auth.login` and `auth.register`.** The most important line on
      this page. Login is the endpoint that gets attacked, and there is currently nothing
      slowing anyone down - the constant-time login path defeats email enumeration, not
      credential stuffing. If you do put it in the app, remember it has to cover the gRPC
      door too; `AuthService/Login` is the same service function reached a different way,
      and a limiter bolted onto tRPC middleware guards half a house.
- [ ] **TLS termination.** The app speaks plain HTTP and expects something in front.
- [ ] **gRPC transport security.** `startGrpcServer` binds with
      `grpc.ServerCredentials.createInsecure()`. That is correct behind a mesh with mTLS
      and wrong on anything routable. Decide which you have.
- [ ] **Response security headers** (HSTS, `X-Content-Type-Options`, frame options). An API
      needs fewer of these than a page server, but `/openapi` serves HTML.
- [ ] **Secret delivery.** `.env` is fine for development. In production `JWT_SECRET`
      should arrive from whatever your platform uses, and rotating it should not require a
      rebuild.
- [ ] **Request timeouts and body size limits**, if your proxy does not already impose
      them.

## Nothing outside the app can do these

No proxy knows what a refresh token is. These are yours.

- [ ] **Refresh token reuse detection.** `auth.service.ts` rotates tokens correctly and
      says out loud that it does not do this. Today, a stolen token gets used once, the
      legitimate user's next refresh is rejected, and nothing anywhere notices. The
      transaction already gives you the hook: when a presented token is found but already
      revoked, that is theft, not a race - revoke the whole family for that user and raise
      something a human will see.
- [ ] **Prune `refresh_tokens`.** Rows are marked `revokedAt` and never deleted, so the
      table grows for the life of the service. A periodic delete of rows that are revoked
      or past `expiresAt` is enough. Note the index on `tokenHash` gets slower long before
      disk becomes the problem.
- [ ] **Tune the pool.** `createDatabase` is `new Pool({ connectionString })` and nothing
      else - default max connections, no idle timeout, no statement timeout. The default
      will hold until your first traffic spike or first slow query, and then it will not.
      Set `max` against your database's actual connection ceiling, and set a statement
      timeout so one bad query cannot pin a connection indefinitely.
- [ ] **Password reset and email verification.** `register` accepts any well-formed address
      and never checks that it exists. Whether that matters depends on the product, but
      "user typed their email wrong and can never get back in" is a support ticket with no
      resolution path in this code.
- [ ] **Decide about MFA** before the user table gets large, because retrofitting it after
      is a migration and a UX project rather than a feature.

## Decide before the first deploy

Short section, quick decisions, but make them deliberately.

- [ ] **`/openapi` is mounted unconditionally** in `app.ts`. Publishing your full API
      surface is a reasonable choice for an internal service and a strange one for a public
      edge. Gate it on `NODE_ENV` if it should not be there.
- [ ] **`/health` does not touch the database.** It reports `uptime` and always answers, so
      it is a liveness probe. The readiness check you probably want is the tRPC
      `health.db` procedure, which runs `select 1`. Wire the orchestrator to the right one
      - pointing a readiness probe at `/health` gives you a pod that reports healthy while
      every request fails.
- [ ] **Observability stops at logs.** Structured NDJSON with a request id threaded through
      both transports is a genuinely good floor, and the id survives an inbound
      `x-request-id`, so traces cross service boundaries already. There are no metrics and
      no spans. Add whichever your platform reads.
- [ ] **Check the log redaction list** in `lib/logger.ts` against the fields you add.
      `pino` only redacts the paths named there, so a new secret-bearing field spills. The
      existing code logs user ids rather than emails on purpose - keep that habit.
- [ ] **`CORS_ORIGIN` takes a single origin.** If you serve more than one frontend, that
      needs to become a list, and `credentials: true` means you cannot get lazy and use
      `*`.
- [ ] **Set `COOKIE_DOMAIN` if the app and the API do not share a hostname.** Unset, every
      cookie is host-only: only the host that set it gets it back, which is correct on
      localhost and behind one hostname. Put the Vue app on `app.example.com` and the API
      on `api.example.com` and the session cookies land on a host the page is not on. In
      `base-lacewing` the `csrf_token` cookie the page reads and echoes back as a header is
      not visible to it either, so every mutation comes back a CSRF failure and no part of
      the error mentions cookies. `COOKIE_DOMAIN=example.com` scopes them to the shared
      parent, at the price of reaching every subdomain underneath, including any you do not
      operate, `csrf_token` included. It only reaches hosts under one registrable domain;
      serving the app from a different domain means putting both behind one origin, because
      `SameSite=None` is not on offer here.

## Watch these as the code grows

Neither is a problem now. Both get worse quietly.

- [ ] **Services receive the transport's context object.** A tRPC `Context` extends
      `ServiceCtx`, so a resolver passes itself straight in and the service's parameter
      type hides `req` and `resHeaders`. The type system is honest here, but the *object*
      still carries those fields at runtime - one `as any`, or one `log.info({ ctx })`, and
      transport state is somewhere it was never meant to be. If that ever stops feeling
      like a fair trade, destructure at the call site.
- [ ] **`auth/policy.ts` is imported by the browser as runtime code**, not just as types,
      so that `canMutate` exists once instead of twice. It has no imports beyond a type
      today. The moment somebody adds one that reaches Drizzle or `node:crypto`, the
      frontend bundle breaks in a way that is annoying to diagnose. Worth a lint rule if
      the file ever grows past one function.

---

## What you are starting from

So the floor is clear before you add to it. The test suites run against PGlite - real
Postgres, in-process, running the same `drizzle/` migrations production runs - plus a real
gRPC server on a real port called with real signed tokens:

| | backend | frontend |
| --- | --- | --- |
| `base` | 18 | 4 |
| `base-jwt` | 44 | 10 |
| `base-lacewing` | 47 | 10 |

CI additionally boots the server and curls `/health`, because the tests import `src/`
directly and never start a process. That step exists to catch a specific failure: every
test passing, the build exiting 0, and the image dying on its first line because a native
addon could not resolve. Keep it.

What the suite does not cover: the frontend tests are thin, and nothing here has been run
against a real Postgres server rather than PGlite. The dialect is the same and the
migrations are the same, so the gap is narrow, but it is not zero - connection handling,
timeouts and concurrency are exactly the things PGlite cannot tell you about.
