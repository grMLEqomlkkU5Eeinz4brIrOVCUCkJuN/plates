# Before you ship this

Most of what is missing here is missing on purpose.

Express ships almost nothing by default, so every middleware in `app.ts` is a decision
somebody made. The ones that are absent are absent because they are usually made one layer
up: a template that mounts a rate limiter has decided you are not behind an API gateway,
and one that terminates TLS has decided you are not behind a load balancer that already
did. Those belong to whoever deploys the service, which is you.

The useful split is not "important" versus "nice to have". It is **whether the thing can be
done outside the application at all.**

---

## Start here

- [ ] **Nothing is persisted.** `controllers/user.controller.ts` is a
      `new Map<string, UserData>()` with a comment saying to replace it. Restart the
      process and every user is gone; run two replicas and they disagree about reality.
- [ ] **Nothing is authenticated.** In the auth templates, `login` carries this:

      ```ts
      // TODO: Replace with actual user authentication logic
      const userId = "user-" + Math.random().toString(36).substring(2, 9);
      ```

      Any email and any password mint a valid session for a freshly invented user. Every
      token, cookie, CSRF and revocation path downstream of that line is real and worth
      keeping - the line itself is a placeholder, and it is the first thing to replace.

Neither of these is a defect. A template cannot pick your database, and the surrounding
plumbing is the part that was hard to get right. But do not let the passing test suite
persuade you that the auth story is finished, because the tests exercise the plumbing, not
the credential check that does not exist yet.

`base-backend-jwt-prisma` is the exception to both items: accounts are rows, passwords
are argon2id hashes, refresh tokens are rotated database rows with reuse detection, and
its suite runs against a real Postgres. It also already has the request id, the rate
limiter, `trust proxy`, the body limit and the readiness probe from the lists below. Its
own README has the list of what it still leaves to you.

## Usually not the application's job

Tick these off by naming the thing that already handles them. If nothing does, they move to
the section below.

- [ ] **Rate limiting.** `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX` are already in
      `config/env.ts`, validated, defaulted to a 15-minute / 100-request window - and read
      by nothing. Grep for them and `config/env.ts` is the only hit in every template.
      Either wire them to `express-rate-limit` or delete them, because config that
      describes a protection you do not have is worse than no config: it reads like the
      box is ticked.
- [ ] **TLS termination.** The app speaks plain HTTP and sets `Secure` cookies
      unconditionally, so it already assumes something in front of it.
- [ ] **`app.set("trust proxy", ...)`.** Not set anywhere, and behind a proxy that has
      three consequences worth knowing: `req.ip` becomes the proxy's address for everyone,
      `req.secure` is always false, and - the sharp one - `middleware/csrf.ts` uses
      `req.ip` as its session identifier fallback, so every anonymous client collapses into
      a single shared CSRF session. Set it to the number of proxies you actually run, not
      to `true`.
- [ ] **Request timeouts and body limits**, if your proxy does not impose them.
      `express.json()` is mounted with its 100 kb default, which is usually fine.

## Nothing outside the app can do these

No gateway knows what a `jti` is.

- [ ] **Replace `MemoryRevocationStore`.** `config/lacewing.ts` says so itself. Right now
      logout and refresh rotation genuinely revoke tokens - which is more than most
      templates manage - but the store lives in one process. The second replica does not
      know a token was revoked, so logout stops meaning logout the moment you scale past
      one pod. lacewing takes any `RevocationStore`; back it with Redis.
- [ ] **Password hashing**, once real credentials exist. Nothing in the dependency list
      hashes anything today, because there is nothing to hash yet. Use argon2id, and
      compare in constant time even for unknown emails.
- [ ] **Send logs to stdout in a container.** `utils/logger.ts` writes rotating files to
      `path.join(__dirname, "..", "..", "logs")`, which inside the image is `/app/logs` -
      an ephemeral layer nobody collects. The console transport is already there; the file
      transports are the ones to drop when you containerise. The Dockerfile creates and
      chowns that directory so the non-root process can write to it, which keeps the
      default working - it does not make the default a good idea in a container.

## Decide before the first deploy

- [ ] **`/docs` and `/docs.json` are mounted unconditionally** in `app.ts`. Swagger UI on a
      public edge publishes your whole API surface. Gate it on `NODE_ENV`.
- [ ] **The health check is static.** `getHealth` returns `{ status: "ok" }` and a
      timestamp without touching anything, so it is a liveness probe. Point readiness at
      something that actually checks a dependency once you have one, or you will get pods
      reporting healthy while every request fails.
- [ ] **Set `COOKIE_DOMAIN` if more than one of your hosts has to see the session.**
      Unset, the auth and CSRF cookies are host-only: only the host that set them gets them
      back, which is correct on localhost and behind a single hostname. Split the
      deployment, say a session minted by `auth.example.com` that `api.example.com`
      verifies, and CSRF breaks first: `middleware/csrf.ts` HMACs each token against the
      access-token cookie, so where the CSRF cookie does not reach, valid requests fail the
      check with a 403. `COOKIE_DOMAIN=example.com` scopes both to the shared parent, and
      the clear path uses the same value, so logout still expires the cookie the browser
      holds. A `Domain` cookie goes to every subdomain underneath, including ones you do
      not run, and it only reaches hosts under one registrable domain: a frontend on a
      different domain has to come through a shared origin or authenticate with a bearer
      token, because `SameSite=None` is not on offer here.
- [ ] **`server.keepAliveTimeout` and `server.headersTimeout` are unset.** Node's defaults
      are shorter than the idle timeout on an AWS ALB, which produces intermittent 502s
      that are miserable to diagnose. Set them above whatever your load balancer uses.
- [ ] **Observability stops at logs.** No metrics, no traces, and no request id threaded
      through them, so two concurrent requests interleave in the log with nothing to tell
      them apart. A request id is the cheapest thing on this page and the one you will
      want first.

## Which template am I even using?

Repo hygiene rather than production readiness, but it affects trust. There are four
backends here and two pairs of near-identical names:

- `base-backend` and `base-backend-new` differ in six source files.
- `back-backend-jwt` and `base-backend-jwt` differ in eight, and one of those names looks
  like a typo.

Nothing says which is current. Before anyone builds on these, pick the survivors, delete
the rest, and add a top-level README the way `bevd/` has one.

---

## What you are starting from

So the floor is clear. Supertest against the real Express app, no mocks in the request
path:

| | test files | tests |
| --- | --- | --- |
| `base-backend` | 3 | 16 |
| `base-backend-jwt` | 4 | 22 |
| `base-backend-lacewing` | 5 | 34 |

CI lints, builds and runs those on Node 24. It does not start the built
artefact. That gap matters more here than it would elsewhere, because these templates
compile to `dist/` and the container runs `node dist/main.js` - a path that no test
touches. The `bevd/` templates guard the equivalent gap with a step that boots the server
and curls `/health`; the same twelve lines would work here.

What the suite does not cover: there is no database to integration-test against, and the
auth tests verify token and cookie handling around a login that authenticates nobody. Both
follow from the two items at the top of this page.
