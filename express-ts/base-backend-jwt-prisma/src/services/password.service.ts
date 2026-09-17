import argon2 from "argon2";
import { env } from "../config/env";

/**
 * argon2id, with the cost read from the environment so the test suite can
 * turn it down. Verification reads the parameters back out of each stored
 * hash, so raising the cost in production never invalidates a password;
 * the next successful login is when a hash could be upgraded, if you add that.
 */
const options = {
	type: argon2.argon2id,
	memoryCost: env.ARGON2_MEMORY_KIB,
	timeCost: env.ARGON2_TIME_COST,
	parallelism: 1,
} as const;

export const hashPassword = (plain: string): Promise<string> => argon2.hash(plain, options);

/** False, never a throw, for a hash that does not parse: a corrupt row must
 *  answer the same 401 a wrong password does, not a 500. */
export const verifyPassword = async (hash: string, plain: string): Promise<boolean> => {
	try {
		return await argon2.verify(hash, plain);
	} catch {
		return false;
	}
};

/**
 * A dummy verify run when no account matches, so a login against an unknown
 * address costs the same as one against a known address. Without it, response
 * timing enumerates the user base.
 *
 * Built on first use rather than at import: a rejected promise sitting
 * unawaited at module load is an unhandledRejection, which main.ts treats as a
 * reason to shut down.
 */
let dummyHash: Promise<string> | null = null;

export const equalisePasswordTiming = async (): Promise<void> => {
	dummyHash ??= argon2.hash("timing-equalisation-placeholder", options);
	await verifyPassword(await dummyHash, "not-the-password");
};
