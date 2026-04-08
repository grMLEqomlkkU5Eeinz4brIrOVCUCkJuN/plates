import type { Config } from "jest";

const config: Config = {
	preset: "ts-jest",
	testEnvironment: "node",
	rootDir: "src",
	moduleFileExtensions: ["ts", "js", "json"],
	testMatch: [
		"**/*.test.ts",
		"**/*.spec.ts",
	],
	collectCoverageFrom: [
		"**/*.ts",
		"!**/*.test.ts",
		"!**/*.spec.ts",
		"!**/types/**",
	],
	coverageDirectory: "../coverage",
	setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
	moduleNameMapper: {
		"^@/(.*)$": "<rootDir>/$1",
	},
};

export default config;
