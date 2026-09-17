import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

/**
 * Loads the committed test contract (.env.test) before any module that reads
 * the environment is imported. See that file for what the values are and why
 * they are safe to commit.
 *
 * This is a jest `setupFiles` entry, so it runs once per test file ahead of
 * config/env.ts. NODE_ENV is pinned here rather than left to the ambient
 * value: the suite must not run as development, and a machine that exports
 * NODE_ENV would otherwise have the logger writing rotating files under the
 * repository on every run. Individual values can still be overridden from the
 * shell: a variable that is already set is left alone.
 *
 * Parsed and assigned by hand rather than through process.loadEnvFile, which
 * writes to the real process.env; jest hands every test file a copy of the
 * environment taken when its sandbox was built, so the first file to run
 * would see nothing and the rest would only see it by accident of ordering.
 *
 * The path is resolved from this file rather than process.cwd() so it does not
 * matter which directory jest was launched from.
 */
process.env.NODE_ENV = "test";

const contract = parseEnv(readFileSync(join(__dirname, "../../.env.test"), "utf8"));

for (const [key, value] of Object.entries(contract)) {
	process.env[key] ??= value;
}
