# plates

Project templates. Grab one, don't clone the whole repo.

## Scope

These are for microservices: one service, one job, an HTTP or RPC boundary in front of
it. So they are thin: no queue, no cache, no CMS, no admin panel, nothing about your
infrastructure.

More importantly this is why we are not really using a lot of cooler new hippier frameworks at the moment.

That said, I might be open to adding microservice templates of various languages in this repo.

The full-stack `bevd/` templates and their Vue frontend came later, because enough people
asked for something they could point a browser at without wiring up a second repo. They
are still services underneath, with the logic in the services and the transports only
translating.

[docs/frameworks.md](./docs/frameworks.md) lists what every template runs on, backend and
frontend, and why. Read it if you are choosing between them.

## Templates

### Backend only: Express + TypeScript

| Template | Auth | Notes |
| --- | --- | --- |
| `express-ts/base-backend` | none | Express 5 + TypeScript. No async wrapper: Express 5 forwards rejected handlers to the error handler. |
| `express-ts/base-backend-jwt` | JWT (cookies + CSRF) | Adds auth routes. |
| `express-ts/base-backend-lacewing` | JWT via [lacewing](https://github.com/Smiduweorc/lacewing) (cookies + CSRF) | `base-backend-jwt` rebuilt on lacewing: profiles, access/refresh `typ` split, revocation, hardened cookies. |
| `express-ts/base-backend-jwt-prisma` | JWT (cookies + CSRF), real accounts | The only `express-ts` template with a database: Postgres through Prisma 7, argon2id passwords, rotated refresh tokens with reuse detection, tests against a real Postgres. Start here if you need persistence. |

These share the ESLint, TypeScript, `.editorconfig`, lefthook and CI config in
[`standard/`](./standard). Read its README before changing any of it.

### Full-stack: Bun + Elysia + Vue + Drizzle

| Template | Auth | Notes |
| --- | --- | --- |
| `bevd/base` | none | REST + tRPC + gRPC over shared services, plus a Vue 3 frontend typed from the router. |
| `bevd/base-jwt` | JWT (httpOnly cookies) + roles | The same, plus sessions, refresh-token rotation and admin-only resources. |
| `bevd/base-lacewing` | JWT via [lacewing](https://github.com/Smiduweorc/lacewing) + roles + CSRF | `base-jwt` with the token handling moved onto lacewing, plus double-submit CSRF through to the Vue client. |

See [`bevd/`](./bevd). These use Biome instead of `standard/`'s ESLint; that README says
why and lists the gotchas.

## Grab a template

degit pulls a single folder, with no git history:

```sh
npx degit grMLEqomlkkU5Eeinz4brIrOVCUCkJuN/plates/express-ts/base-backend my-app
cd my-app
git init
```

Swap `express-ts/base-backend` for the template you want, such as `bevd/base-jwt`.

<details>
<summary>With plain git instead (sparse checkout)</summary>

```sh
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/grMLEqomlkkU5Eeinz4brIrOVCUCkJuN/plates.git my-app
cd my-app
git sparse-checkout set express-ts/base-backend

# flatten it into the repo root, then start your own history
mv express-ts/base-backend/* express-ts/base-backend/.[!.]* .
rm -rf express-ts .git
git init
```

</details>

## Then

A `bevd/` template runs on Bun; follow [its README](./bevd).

An `express-ts/` template needs Node 24 (see `.nvmrc`):

```sh
npm install   # also installs the git hooks
npm run dev   # loads the committed .env.development
```

Each `express-ts` template commits a `.env.development` with dev-only values, the JWT
secrets included, so `npm run dev` works straight after `npm install`. For production,
`cp .env.production.example .env.production` and fill it in; `npm start` loads that file.

`base-backend-jwt-prisma` also needs Postgres; its README covers that.

The JWT templates need `JWT_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET` and
`CSRF_SECRET`, each at least 32 characters. `base-backend-jwt-prisma` needs only
`JWT_SECRET` and `CSRF_SECRET`: its refresh tokens are database rows and nothing signs a
cookie. `base-backend-lacewing` entropy-checks them at boot, so they must be random; run
`npm run secrets` and paste the output into `.env.production`.

To verify a lacewing template's tokens from a second service while staying on HMAC, read
[docs/symmetric-jwks.md](./docs/symmetric-jwks.md) before building a JWKS endpoint. A
symmetric JWKS is a secret document.
