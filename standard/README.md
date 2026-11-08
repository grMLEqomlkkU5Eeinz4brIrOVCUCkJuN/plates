# standard

Shared config for the `express-ts` templates. Copy it into a new template. Nothing syncs
the copies, so a fix made here has to be copied into the other templates by hand.

## What's here

| File | Purpose |
| --- | --- |
| `.editorconfig` | Indent, charset and EOL rules: tabs, width 4. The only formatting config. |
| `eslint.config.mjs` | Flat ESLint config: `js` + `typescript-eslint` recommended, type-aware. |
| `tsconfig.json` | The whole of `src` plus tests. Used by the editor, ESLint and ts-jest. |
| `tsconfig.build.json` | What ships. Extends the above, excludes tests, emits to `dist/`. |
| `.nvmrc` | Node 24. CI reads it. |
| `.gitignore` | Node/TypeScript ignores. Commits `.env.example`, ignores every other `.env`. |
| `commitlint.config.js` | Conventional Commits. |
| `lefthook.yml` | Git hooks: lints the commit message and staged files. |
| `.vscode/` | ESLint autofix on save, recommended extensions. |
| `.github/workflows/ci.yml` | Lint, build, then test on Node 24. |

## Applying it to a template

```sh
cp -r standard/. <template>/
cd <template>
npm i -D typescript @tsconfig/node24 \
         eslint @eslint/js typescript-eslint globals \
         lefthook @commitlint/cli @commitlint/config-conventional
```

CI calls `npm run lint`, `npm run build` and `npm test`, so the template's `package.json`
needs those scripts (`build` is `tsc -p tsconfig.build.json`), `"prepare": "lefthook
install"`, and `"engines": { "node": ">=24.0.0" }`.

## Notes

### Two tsconfigs

The build needs tests excluded so they stay out of `dist/`; ESLint's type-aware rules and
ts-jest need them included. Excluding tests from a single tsconfig gives `was not found by
the project service` parse errors on every test file. So `tsconfig.json` covers everything
and never emits, and `tsconfig.build.json` narrows to shippable source and owns
`rootDir`/`outDir`. The build uses the build config; type-checking, ESLint and Jest use
the full one.

### Other things to know

- `@tsconfig/node24` must be a real devDependency. If TypeScript cannot resolve an
  `extends` target it does not error; it silently falls back to compiler defaults (no
  `esModuleInterop`, `target: es5`) and buries you in unrelated type errors. Keep its
  major in step with `.nvmrc`.
- TypeScript stays on 5.x. `ts-jest` declares `typescript >=4.3 <7`, so TypeScript 7 will
  not install alongside it. Revisit when ts-jest supports it.
- Formatting is `.editorconfig` only: tabs, width 4, LF, final newline. There is no
  Prettier step. ESLint checks correctness, not layout.
- `no-console` is an error. Templates ship a logger. The exception is bootstrap code that
  runs before the logger exists (`config/env.ts`), which carries an inline
  `eslint-disable-next-line`.
- `commitlint.config.js` is CommonJS. In a template with `"type": "module"`, rename it to
  `commitlint.config.cjs`.
- YAML is space-indented, because the YAML spec forbids tabs. `.editorconfig` already
  handles this.
- `prepare` runs `lefthook install`, which writes to the nearest `.git`. In a template
  that is its own repo that is right. Running `npm install` on a template inside this
  repo installs hooks into `plates/.git/hooks` instead; harmless, but delete them if they
  show up.
