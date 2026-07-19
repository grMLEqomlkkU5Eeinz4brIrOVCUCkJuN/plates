import {
	accessTokenProfile,
	refreshTokenProfile,
	importKey,
	MemoryRevocationStore,
	type ExpectedJwtProfile,
	type LacewingKey,
} from "lacewing";
import { env } from "./env";

/**
 * Everything token-related, defined once. Profiles are lacewing's central
 * idea: issuer, audience, algorithm allowlist and key source are decided
 * here, and jwtVerify(token, profile) is the only verification path the
 * rest of the codebase gets.
 */
export interface AuthKit {
	accessKey: LacewingKey<"HS256">;
	refreshKey: LacewingKey<"HS256">;
	accessProfile: ExpectedJwtProfile;
	refreshProfile: ExpectedJwtProfile;
	revocation: MemoryRevocationStore;
}

/**
 * Refresh tokens are audience-scoped to the refresh endpoint, never the
 * API - so even with identical keys, a refresh token cannot buy API access
 * (and the mutually exclusive `typ` enforces the same split a second way).
 */
export const REFRESH_AUDIENCE = `${env.JWT_ISSUER}/api/v1/auth/refresh`;

let kit: Promise<AuthKit> | undefined;

const build = async (): Promise<AuthKit> => {
	// importKey entropy-checks HMAC secrets: a human-chosen string like
	// "my-secret-password" throws EntropyCheckFailed and the app refuses
	// to boot. `npm run secrets` prints ones that pass.
	const accessKey = await importKey(env.JWT_SECRET, "HS256");
	const refreshKey = await importKey(env.JWT_REFRESH_SECRET, "HS256");

	// In-memory revocation: fine for a single process, swap for a
	// Redis/DB-backed RevocationStore when you scale out.
	const revocation = new MemoryRevocationStore();

	const accessProfile = accessTokenProfile({
		issuer: env.JWT_ISSUER,
		audience: env.JWT_AUDIENCE,
		algorithms: ["HS256"],
		keys: accessKey,
		maxTokenAge: env.JWT_ACCESS_EXPIRY,
		revocation,
	});

	const refreshProfile = refreshTokenProfile({
		issuer: env.JWT_ISSUER,
		audience: REFRESH_AUDIENCE,
		algorithms: ["HS256"],
		keys: refreshKey,
		maxTokenAge: env.JWT_REFRESH_EXPIRY,
		revocation,
	});

	return { accessKey, refreshKey, accessProfile, refreshProfile, revocation };
};

/** Memoized: keys import once, on first use. */
export const authKit = (): Promise<AuthKit> => (kit ??= build());
