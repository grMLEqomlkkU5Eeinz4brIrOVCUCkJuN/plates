import { randomUUID } from "node:crypto";
import { isUniqueViolation, prisma } from "../db/prisma";
import type { Prisma, User } from "../generated/prisma/client";
import { httpError } from "../middleware/errorHandler";
import logger from "../utils/logger";
import { toAccount, type Account } from "../models/user.model";
import { equalisePasswordTiming, hashPassword, verifyPassword } from "./password.service";
import {
	REFRESH_TTL_SECONDS,
	generateRefreshToken,
	hashRefreshToken,
	signAccessToken,
} from "./token.service";

export interface SessionTokens {
	accessToken: string;
	refreshToken: string;
}

const refreshExpiry = (): Date => new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);

/**
 * Opens a session: one refresh-token family, and an access token naming it.
 *
 * The family id is what the access token carries as `sid`, so logout can
 * revoke the chain from the access token alone: the refresh cookie is scoped
 * to /api/v1/auth/refresh and never reaches the logout endpoint.
 *
 * Takes the client to write with rather than reaching for `prisma`, so that
 * registration can create the account and its first session in one
 * transaction; login has nothing else to write and passes `prisma` itself.
 */
const openSession = async (
	client: Prisma.TransactionClient,
	user: User
): Promise<SessionTokens> => {
	const familyId = randomUUID();
	const refresh = generateRefreshToken();

	await client.refreshToken.create({
		data: {
			userId: user.id,
			familyId,
			tokenHash: refresh.hash,
			expiresAt: refreshExpiry(),
		},
	});

	return {
		accessToken: signAccessToken({ sub: user.id, sid: familyId }),
		refreshToken: refresh.token,
	};
};

export const registerAccount = async (params: {
	email: string;
	name: string;
	password: string;
}): Promise<{ user: Account; tokens: SessionTokens }> => {
	const passwordHash = await hashPassword(params.password);

	let created: { user: User; tokens: SessionTokens };

	// One transaction: an account with no session would answer this request
	// with a 500 and exist anyway, and the next attempt would say EMAIL_TAKEN.
	try {
		created = await prisma.$transaction(async (tx) => {
			const user = await tx.user.create({
				data: { email: params.email, name: params.name, passwordHash },
			});

			return { user, tokens: await openSession(tx, user) };
		});
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw httpError(409, "That email address is already registered.", {
				errorCode: "EMAIL_TAKEN",
			});
		}
		throw error;
	}

	logger.info("Account registered", { userId: created.user.id });

	return { user: toAccount(created.user), tokens: created.tokens };
};

export const loginAccount = async (params: {
	email: string;
	password: string;
}): Promise<{ user: Account; tokens: SessionTokens }> => {
	const user = await prisma.user.findUnique({ where: { email: params.email } });

	// One message for "no such user" and "wrong password": a different answer
	// for each would let anyone test which emails have accounts, and so would
	// a faster answer, hence the dummy verify.
	if (!user) {
		await equalisePasswordTiming();
		throw httpError(401, "Email or password is incorrect.", {
			errorCode: "INVALID_CREDENTIALS",
		});
	}

	if (!(await verifyPassword(user.passwordHash, params.password))) {
		throw httpError(401, "Email or password is incorrect.", {
			errorCode: "INVALID_CREDENTIALS",
			logContext: { userId: user.id },
		});
	}

	return { user: toAccount(user), tokens: await openSession(prisma, user) };
};

/** Ends every token in a family. Its own statement, never inside the
 *  transaction that then rejects the request: a throw would roll it back and
 *  a replayed token would leave the family alive. */
const revokeFamily = async (familyId: string): Promise<void> => {
	await prisma.refreshToken.updateMany({
		where: { familyId, revokedAt: null },
		data: { revokedAt: new Date() },
	});
};

/**
 * Rotates a refresh token, and treats a second use of one as theft.
 *
 * A refresh token is single use. If one is presented twice, either the client
 * lost a response and retried, or somebody is replaying a stolen token, and
 * from here those are indistinguishable. The whole family is revoked either
 * way: the honest client signs in again, and the thief's chain dies with the
 * victim's.
 *
 * The session slides: each refresh grants another REFRESH_TOKEN_EXPIRY, so a
 * session in use stays open and an idle one ends.
 */
export const refreshSession = async (token: string): Promise<SessionTokens> => {
	const stored = await prisma.refreshToken.findUnique({
		where: { tokenHash: hashRefreshToken(token) },
	});

	if (!stored) {
		throw httpError(401, "Refresh token is not valid.", { errorCode: "REFRESH_INVALID" });
	}

	const now = new Date();

	if (stored.revokedAt || stored.expiresAt <= now) {
		throw httpError(401, "Session has expired. Sign in again.", {
			errorCode: "REFRESH_INVALID",
			logContext: { userId: stored.userId, familyId: stored.familyId },
		});
	}

	// Spending the token is a conditional update rather than a read followed
	// by a write, so two requests carrying the same token cannot both pass:
	// Postgres serialises them and exactly one updates a row. Whichever loses
	// is a reuse, whether it came from a thief or from a client that retried.
	const claimed = await prisma.refreshToken.updateMany({
		where: { id: stored.id, usedAt: null },
		data: { usedAt: now },
	});

	if (claimed.count === 0) {
		await revokeFamily(stored.familyId);

		logger.warn("Refresh token reuse detected, family revoked", {
			userId: stored.userId,
			familyId: stored.familyId,
		});

		throw httpError(401, "Refresh token has already been used.", {
			errorCode: "REFRESH_REUSED",
		});
	}

	// The token is spent from here. If the insert below fails, this session
	// ends and the user signs in again, which is the direction to fail in: the
	// alternative is a token that stays valid after being used.
	const next = generateRefreshToken();

	await prisma.refreshToken.create({
		data: {
			userId: stored.userId,
			familyId: stored.familyId,
			tokenHash: next.hash,
			expiresAt: refreshExpiry(),
		},
	});

	return {
		accessToken: signAccessToken({ sub: stored.userId, sid: stored.familyId }),
		refreshToken: next.token,
	};
};

/** Ends one session. The access token it issued stays valid until it expires;
 *  that window is what the short JWT_ACCESS_EXPIRY buys. */
export const revokeSession = async (sessionId: string): Promise<void> => {
	await revokeFamily(sessionId);
};
