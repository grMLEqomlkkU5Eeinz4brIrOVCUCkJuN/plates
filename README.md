# plates

Project templates. Grab one, don't clone the whole repo.

## Templates

### Backend only - Express + TypeScript

| Template                    | Auth                  | Notes                            |
| --------------------------- | --------------------- | -------------------------------- |
| `express-ts/base-backend`    | none                  | Express + TypeScript. Uses an `asyncHandler` wrapper for route errors. |
| `express-ts/base-backend-new`| none                  | Same, without the `asyncHandler` wrapper. |
| `express-ts/back-backend-jwt`| JWT (cookies + CSRF) | Adds auth routes. Uses `asyncHandler`. |
| `express-ts/base-backend-jwt`| JWT (cookies + CSRF) | Adds auth routes. Without `asyncHandler`. |
| `express-ts/base-backend-lacewing`| JWT via [lacewing](https://github.com/Smiduweorc/lacewing) (cookies + CSRF) | `base-backend-jwt` rebuilt on lacewing: profiles, access/refresh `typ` split, revocation, hardened cookies. Doubles as a lacewing demo. |

These share the config in [`standard/`](./standard) - Prettier, ESLint, TypeScript,
lefthook, CI. See that folder's README before changing any of it.

### Full-stack - Bun + Elysia + Vue + Drizzle

| Template          | Auth                     | Notes                            |
| ----------------- | ------------------------ | -------------------------------- |
| `bevd/base`       | none                     | REST + tRPC + gRPC over shared services, plus a Vue 3 frontend typed end to end. |
| `bevd/base-jwt`   | JWT (httpOnly cookies) + roles | The same, plus sessions, refresh-token rotation, and admin-only resources. |
| `bevd/base-lacewing` | JWT via [lacewing](https://github.com/Smiduweorc/lacewing) + roles + CSRF | `base-jwt` with the token lifecycle moved onto lacewing, plus double-submit CSRF end to end (Vue client included). Doubles as a lacewing demo. |

See [`bevd/`](./bevd). These use **Biome** instead of `standard/`'s ESLint + Prettier -
that folder's README explains why, and lists the footguns worth knowing before you start.

## Grab a template

pulls a single folder, no git history, no extra tooling:

```sh
npx degit grMLEqomlkkU5Eeinz4brIrOVCUCkJuN/plates/express-ts/base-backend my-app
cd my-app
git init
```

Swap `express-ts/base-backend` for whichever template you want - `bevd/base-jwt`, and so on.

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

For a **`bevd/`** template, follow [its own README](./bevd) - those run on Bun, not npm.

For an **`express-ts/`** template:

```sh
npm install          # also installs the git hooks
cp .env.example .env # JWT templates only
npm run dev
```

The `express-ts` JWT templates won't boot until `.env` has `JWT_SECRET`,
`JWT_REFRESH_SECRET`, `COOKIE_SECRET` and `CSRF_SECRET` - each at least 32 characters.
For `base-backend-lacewing` they must also be actually random - lacewing entropy-checks
them at boot - so run `npm run secrets` and paste the output into `.env`.

When a lacewing template's tokens need verifying from a second service while staying on
HMAC, see [docs/symmetric-jwks.md](./docs/symmetric-jwks.md) before building a JWKS
endpoint - a symmetric JWKS is a secret document, not a public one.

### Scripts (`express-ts`)

| Script                | Does                                        |
| --------------------- | ------------------------------------------- |
| `npm run dev`         | Watch mode via nodemon.                     |
| `npm run build`       | Compile to `dist/` (tests excluded).        |
| `npm start`           | Run the build.                              |
| `npm test`            | Jest.                                       |
| `npm run typecheck`   | Type-check everything, tests included.      |
| `npm run lint`        | ESLint.                                     |
| `npm run format`      | Prettier, write.                            |

Requires Node 24 (see `.nvmrc`).
