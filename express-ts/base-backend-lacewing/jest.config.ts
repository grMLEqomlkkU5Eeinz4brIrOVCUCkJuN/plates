import type { Config } from "jest";

const config: Config = {
	preset: "ts-jest",
	testEnvironment: "node",
	rootDir: "src",
	moduleFileExtensions: ["ts", "js", "json"],
	testMatch: ["**/*.test.ts", "**/*.spec.ts"],
	collectCoverageFrom: [
		"**/*.ts",
		"!**/*.test.ts",
		"!**/*.spec.ts",
		"!**/types/**",
	],
	coverageDirectory: "../coverage",
	setupFiles: ["<rootDir>/test/env.ts"],
	setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
	// lacewing (and the jose it wraps) ship ESM only; Jest's CJS runtime
	// cannot require() them, so they are transpiled like our own sources.
	transformIgnorePatterns: ["node_modules/(?!(lacewing|jose)/)"],
	transform: {
		"^.+\\.[tj]s$": ["ts-jest", { tsconfig: { allowJs: true } }],
	},
	moduleNameMapper: {
		"^@/(.*)$": "<rootDir>/$1",
		"^(\\.{1,2}/.*)\\.js$": "$1",
	},
};

export default config;
