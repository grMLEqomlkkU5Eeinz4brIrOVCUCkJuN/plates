# plates

Project templates. Grab one, don't clone the whole repo.

## Templates

| Template                    | Auth                  | Notes                            |
| --------------------------- | --------------------- | -------------------------------- |
| `express-ts/base-backend`    | none                  | Express + TypeScript. Uses an `asyncHandler` wrapper for route errors. |
| `express-ts/base-backend-new`| none                  | Same, without the `asyncHandler` wrapper. |
| `express-ts/back-backend-jwt`| JWT (cookies + CSRF) | Adds auth routes. Uses `asyncHandler`. |
| `express-ts/base-backend-jwt`| JWT (cookies + CSRF) | Adds auth routes. Without `asyncHandler`. |

All of them share the config in [`standard/`](./standard) — Prettier, ESLint,
TypeScript, lefthook, CI. See that folder's README before changing any of it.

## Grab a template

pulls a single folder, no git history, no extra tooling:

```sh
npx degit grMLEqomlkkU5Eeinz4brIrOVCUCkJuN/plates/express-ts/base-backend my-app
cd my-app
git init
```

Swap `base-backend` for whichever template you want.

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

```sh
npm install          # also installs the git hooks
cp .env.example .env # JWT templates only
npm run dev
```

The JWT templates won't boot until `.env` has `JWT_SECRET`, `JWT_REFRESH_SECRET`,
`COOKIE_SECRET` and `CSRF_SECRET` — each at least 32 characters.

### Scripts

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
