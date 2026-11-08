# Before you ship this

What the `express-ts` templates leave out. Rate limiting, TLS and the like are usually done
one layer up, by a gateway or load balancer; check what yours does before adding it here.

## Start here

- Nothing is persisted. `controllers/user.controller.ts` is a `new Map()` with a comment
  saying to replace it. Restart the process and every user is gone; run two replicas and
  they disagree.
- Nothing is authenticated. In the auth templates, `login` carries this:

  ```ts
  // TODO: Replace with actual user authentication logic
  const userId = "user-" + Math.random().toString(36).substring(2, 9);
  ```

  Any email and any password get a valid session for a made-up user. The token, cookie,
  CSRF and revocation code after that line is real; the line is a placeholder and the
  first thing to replace. The passing tests cover that code, not a credential check,
  because there is none yet.

`base-backend-jwt-prisma` is the exception to both: accounts are rows, passwords are
argon2id hashes, refresh tokens are rotated database rows with reuse detection, and its
suite runs against a real Postgres. It also already has the request id, rate limiter,
`trust proxy`, body limit and readiness probe from the lists below. Its own README lists
what it still leaves to you.

## Usually handled outside the app

If nothing in front of the app does these, they are yours.

- Rate limiting. `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX` are in `config/env.ts`,
  validated and defaulted to 100 requests per 15 minutes, and nothing reads them. Wire them
  to `express-rate-limit` or delete them, so the config does not suggest a limit that is
  not there.
- TLS termination. The app speaks plain HTTP and its cookies are `Secure` (by default in
  `base-backend-jwt`, always in `base-backend-lacewing`), so it already assumes something
  in front.
- `app.set("trust proxy", ...)` is not set. Behind a proxy, `req.ip` is the proxy's
  address for everyone and `req.secure` is always false. Worse, `middleware/csrf.ts` falls
  back to `req.ip` as its session identifier, so every anonymous client shares one CSRF
  session. Set it to the number of proxies you run, not `true`.
- Request timeouts and body limits, if your proxy does not set them. `express.json()` is
  mounted with its 100 kb default.

## Only the app can do these

- Replace `MemoryRevocationStore` (`base-backend-lacewing`; `config/lacewing.ts` says so).
  Logout and refresh rotation revoke tokens, but the store lives in one process. A second
  replica does not know a token was revoked, so logout stops working once you scale past
  one pod. lacewing takes any `RevocationStore`; back it with Redis.
- Password hashing, once real credentials exist. Nothing hashes anything yet. Use
  argon2id, and compare in constant time even for unknown emails.
- Logs in a container. `utils/logger.ts` writes rotating files to
  `path.join(__dirname, "..", "..", "logs")`, which in the image is `/app/logs`, an
  ephemeral layer nobody collects. Drop the file transports and keep the console one. The
  Dockerfile creates and chowns that directory only so the default does not crash.

## Decide before the first deploy

- `/docs` (Swagger UI) and `/docs.json` are mounted whenever `NODE_ENV` is not
  `production`. Leave it that way unless you want the API published.
- The health check is static. `getHealth` returns `{ status: "ok" }` and a timestamp
  without touching anything, so it is a liveness probe. Point readiness at something that
  checks a dependency once you have one, or pods report healthy while every request fails.
- Set `COOKIE_DOMAIN` if more than one of your hosts has to see the session. Unset, the
  auth and CSRF cookies are host-only: only the host that set them gets them back, which
  is right on localhost and behind one hostname. Split the deployment, say a session
  minted by `auth.example.com` that `api.example.com` verifies, and CSRF breaks first:
  `middleware/csrf.ts` HMACs each token against the access-token cookie, so where that
  cookie does not reach, valid requests get a 403. `COOKIE_DOMAIN=example.com` scopes both
  cookies to the parent, and logout clears them with the same value. A `Domain` cookie
  goes to every subdomain under it, including ones you do not run, and only to hosts under
  one registrable domain. It also rules out the `__Host-` prefix, which means host-only. A frontend on another domain has to come through a shared
  origin. `base-backend-lacewing` also accepts an `Authorization: Bearer` header and
  refuses `SameSite=None`; `base-backend-jwt` and `base-backend-jwt-prisma` accept
  `COOKIE_SAME_SITE=none` with `COOKIE_SECURE=true`.
- `server.keepAliveTimeout` and `server.headersTimeout` are unset. Node's defaults are
  shorter than an AWS ALB's idle timeout, which gives intermittent 502s that are miserable
  to diagnose. Set them above your load balancer's value.
- Observability stops at logs. No metrics, no traces, and no request id, so two
  concurrent requests interleave in the log with nothing to tell them apart. Add a request
  id first.

## Tests

Supertest against the real Express app, no mocks in the request path. CI lints, builds and
runs them on Node 24. It does not start the built artefact, and the container runs
`node dist/main.js`, a path no test touches. The `bevd/` templates cover this with a CI
step that boots the server and curls `/health`; the same step would work here.

Not covered, outside `base-backend-jwt-prisma`: there is no database to test against, and
the auth tests check token and cookie handling around a login that authenticates nobody.
