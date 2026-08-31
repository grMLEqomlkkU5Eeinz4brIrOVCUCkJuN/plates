# standard

The canonical config every template in this repo starts from. When you scaffold a
new template, copy these files in rather than reinventing them, that way a fix
made once lands everywhere.

## What's here

| File                       | Purpose                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `.editorconfig`            | Editor-agnostic indent/charset/EOL rules. Tabs, width 4. The single source of formatting truth. |
| `eslint.config.mjs`        | Flat ESLint config: `js` + `typescript-eslint` recommended, type-aware.                        |
| `tsconfig.json`            | The **whole** project `src` plus tests. Used by your editor, ESLint and ts-jest.             |
| `tsconfig.build.json`      | What actually ships. Extends the above, excludes tests, emits to `dist/`.                      |
| `.nvmrc`                   | Pins Node 24. CI reads this so the version lives in one place.                                 |
| `.gitignore`               | Node/TypeScript ignores. Commits `.env.example`, ignores every other `.env`.                   |
| `commitlint.config.js`     | Enforces Conventional Commits.                                                                 |
| `lefthook.yml`             | Git hooks: lints the commit message, lints staged files.                                       |
| `.vscode/`                 | ESLint autofix on save, recommended extensions.                                                |
| `.github/workflows/ci.yml` | CI: lint, build, then test on Node 24.                                                         |

## Applying it to a template

Copy everything in, then add the tooling the configs depend on:

```sh
cp -r standard/. <template>/

cd <template>
npm i -D typescript @tsconfig/node24 \
         eslint @eslint/js typescript-eslint globals \
         lefthook @commitlint/cli @commitlint/config-conventional
```

And wire up the scripts CI expects:

```json
{
	"engines": { "node": ">=24.0.0" },
	"scripts": {
		"build": "tsc -p tsconfig.build.json",
		"typecheck": "tsc --noEmit",
		"lint": "eslint .",
		"lint:fix": "eslint . --fix",
		"prepare": "lefthook install"
	}
}
```

## Notes

### The two tsconfigs are the point

A single tsconfig can't serve both masters. The build wants tests **excluded** so
they don't land in `dist/`; ESLint's type-aware rules and ts-jest want them
**included** so they can be type-checked at all. Excluding tests from the only
tsconfig gets you `was not found by the project service` parsing errors on every
test file.

So: `tsconfig.json` covers everything and never emits, `tsconfig.build.json`
narrows to shippable source and owns `rootDir`/`outDir`. `npm run build` uses the
build config; `npm run typecheck`, ESLint and Jest use the full one.

### Other things worth knowing

- **`@tsconfig/node24` must be a real devDependency.** If TypeScript can't
  resolve an `extends` target it does not error, it silently falls back to
  compiler defaults (no `esModuleInterop`, `target: es5`) and buries you in
  unrelated type errors. Keep its major in step with `.nvmrc`.
- **TypeScript stays on 5.x.** `ts-jest` declares `typescript >=4.3 <7`, so
  TypeScript 7 will not install alongside it. Revisit when ts-jest supports it.
- **Formatting lives in `.editorconfig`, not a formatter.** Tabs, width 4, LF,
  final newline. Every modern editor honours it; there is no Prettier step to run
  or check. ESLint handles code correctness only, not layout.
- **`no-console` is an error.** Templates ship a logger; use it. The one honest
  exception is bootstrap code that runs before the logger exists (`config/env.ts`),
  which carries an inline `eslint-disable-next-line` saying so.
- **`commitlint.config.js` is CommonJS.** In a template with `"type": "module"`,
  rename it to `commitlint.config.cjs`.
- **YAML is space-indented** despite the tabs-everywhere rule, because the YAML
  spec forbids tabs. `.editorconfig` already knows this.
- **`prepare` runs `lefthook install`, which writes to the nearest `.git`.** When a
  template is its own repo that is exactly right. Running `npm install` on a
  template *inside* this monorepo instead installs hooks into `plates/.git/hooks`, harmless, but delete them if they show up.
