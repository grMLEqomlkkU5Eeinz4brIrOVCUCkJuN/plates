// @ts-check
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
	{
		ignores: ["dist/**", "out/**", "build/**", "coverage/**", "node_modules/**"],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	// Must stay last of the presets: turns off every rule that fights Prettier.
	prettier,
	{
		languageOptions: {
			globals: globals.node,
			parserOptions: {
				projectService: {
					// Root config files belong to no tsconfig; lint them with
					// the default inferred project instead of erroring.
					allowDefaultProject: ["*.js", "*.mjs", "*.cjs"],
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			"@typescript-eslint/no-explicit-any": 0,
			"@typescript-eslint/explicit-function-return-type": 1,
			"@typescript-eslint/no-non-null-assertion": 0,
			"@typescript-eslint/await-thenable": 1,
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
				},
			],
			"@typescript-eslint/no-unused-expressions": [
				"error",
				{ allowTernary: true },
			],
			"no-console": 2,
		},
	},
	// Config files shipped as CommonJS (commitlint.config.js, ...).
	{
		files: ["**/*.js", "**/*.cjs"],
		languageOptions: {
			sourceType: "commonjs",
		},
	}
);
