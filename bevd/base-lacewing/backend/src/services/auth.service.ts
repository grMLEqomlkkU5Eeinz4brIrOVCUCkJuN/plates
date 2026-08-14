import { type } from "arktype";
import { and, eq, isNull } from "drizzle-orm";
import { requireActor } from "../auth/actor";
import { signAccessToken } from "../auth/jwt";
import { hashPassword, verifyPassword } from "../auth/password";
import { revokeSession } from "../auth/sessions";
import { generateRefreshToken, hashRefreshToken, refreshTokenExpiresAt } from "../auth/tokens";
import type { Database } from "../db";
import { type PublicUser, refreshTokens, toPublicUser, users } from "../db/schema";
import { AppError, isUniqueViolation, parseInput } from "../lib/errors";
import type { ServiceCtx } from "./context";

export const RegisterInput = type({
	email: "string.email",
	name: "1 <= string <= 100",
	// argon2 has no length ceiling of its own - the cap is here only to stop someone
	// posting a megabyte and making us hash it. (bcrypt would have forced 72.)
	password: "8 <= string <= 128",
});

export const LoginInput = type({
	email: "string.email",
	password: "1 <= string <= 128",
});

export interface Session {
	user: PublicUser;
	accessToken: string;
	/** Opaque. The HTTP layer puts this in an httpOnly cookie; gRPC hands it back raw. */
	refreshToken: string;
}

/**
 * Issues an access token and records a fresh refresh token.
 *
 * Takes anything that can insert - the database itself, or a transaction - rather than a
 * ServiceCtx, so `refresh` can revoke the old token and mint the new one as a single
 * atomic step. Private to this module, which is why it does not follow the (ctx, input)
 * shape the exported entry points all share.
 */
async function issueSession(tx: Pick<Database, "insert">, user: PublicUser): Promise<Session> {
	const accessToken = await signAccessToken({
		sub: user.id,
		email: user.email,
		role: user.role,
	});

	const refreshToken = generateRefreshToken();

	await tx.insert(refreshTokens).values({
		userId: user.id,
		tokenHash: hashRefreshToken(refreshToken),
		expiresAt: refreshTokenExpiresAt(),
	});

	return { user, accessToken, refreshToken };
}

export async function register(ctx: ServiceCtx, input: unknown): Promise<Session> {
	const { email, name, password } = parseInput(RegisterInput, input);

	const normalisedEmail = email.toLowerCase();

	try {
		const [user] = await ctx.db
			.insert(users)
			.values({
				email: normalisedEmail,
				name,
				passwordHash: await hashPassword(password),
				// Never take the role from input - that would let anyone register as an
				// admin. Promotion happens through the admin-only user.setRole procedure.
				role: "user",
			})
			.returning();

		if (!user) {
			throw new AppError("INTERNAL", "Insert returned no row");
		}

		ctx.log.info({ event: "auth.register", userId: user.id }, "user registered");

		return await issueSession(ctx.db, toPublicUser(user));
	} catch (error) {
		// The UNIQUE index on email is what decides this, not a lookup beforehand.
		if (isUniqueViolation(error)) {
			ctx.log.info({ event: "auth.register.duplicate" }, "registration rejected");

			throw new AppError("CONFLICT", "That email is already registered");
		}

		throw error;
	}
}

export async function login(ctx: ServiceCtx, input: unknown): Promise<Session> {
	const { email, password } = parseInput(LoginInput, input);

	const user = await ctx.db.query.users.findFirst({
		where: eq(users.email, email.toLowerCase()),
	});

	// One message for "no such user" and "wrong password", on purpose: a different answer
	// for each would let anyone test which emails have accounts.
	const invalid = new AppError("UNAUTHORIZED", "Invalid email or password");

	if (!user) {
		// Spend the time a real comparison costs, so the response time does not answer the
		// question the error message refuses to. This is only affordable because the hash
		// runs off-thread - with bcryptjs it would have been a free DoS lever.
		await hashPassword(password);

		ctx.log.info({ event: "auth.login.failed", reason: "unknown_email" }, "login rejected");

		throw invalid;
	}

	if (!(await verifyPassword(password, user.passwordHash))) {
		ctx.log.info(
			{ event: "auth.login.failed", reason: "bad_password", userId: user.id },
			"login rejected",
		);

		throw invalid;
	}

	ctx.log.info({ event: "auth.login", userId: user.id, role: user.role }, "login ok");

	return issueSession(ctx.db, toPublicUser(user));
}

/**
 * Trades a refresh token for a new session and rotates it: the old token is revoked in
 * the same breath, and in the same transaction - a crash between the two would otherwise
 * either strand the user with a dead token or leave the old one alive.
 *
 * A stolen token is therefore good for one use at most. Whoever refreshes second is
 * rejected, which is the signal you would build reuse detection on (revoke the whole
 * family, force a re-login) if you need it.
 *
 * The token is an argument rather than part of the input schema: it arrives from a cookie
 * over HTTP and from the request body over gRPC, and the service should not have to care
 * which. Both transports pull it out and hand it over.
 */
export async function refresh(ctx: ServiceCtx, token: string | undefined): Promise<Session> {
	if (!token) {
		throw new AppError("UNAUTHORIZED", "No refresh token");
	}

	const tokenHash = hashRefreshToken(token);

	return ctx.db.transaction(async (tx) => {
		const stored = await tx.query.refreshTokens.findFirst({
			where: and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)),
		});

		if (!stored || stored.expiresAt.getTime() < Date.now()) {
			ctx.log.info({ event: "auth.refresh.rejected" }, "refresh rejected");

			throw new AppError("UNAUTHORIZED", "Invalid or expired refresh token");
		}

		const user = await tx.query.users.findFirst({ where: eq(users.id, stored.userId) });

		if (!user) {
			throw new AppError("UNAUTHORIZED", "Invalid or expired refresh token");
		}

		await tx
			.update(refreshTokens)
			.set({ revokedAt: new Date() })
			.where(eq(refreshTokens.id, stored.id));

		ctx.log.info({ event: "auth.refresh", userId: user.id }, "session refreshed");

		return issueSession(tx, toPublicUser(user));
	});
}

/** Revokes the one token. Logging out of this browser does not sign you out everywhere. */
export async function logout(ctx: ServiceCtx, token: string | undefined): Promise<{ ok: true }> {
	if (token) {
		await revokeSession(ctx.db, hashRefreshToken(token));

		ctx.log.info({ event: "auth.logout" }, "logged out");
	}

	return { ok: true };
}

export async function me(ctx: ServiceCtx): Promise<PublicUser> {
	const current = requireActor(ctx.actor);

	const user = await ctx.db.query.users.findFirst({ where: eq(users.id, current.id) });

	if (!user) {
		// The token is signed and unexpired, but the account is gone.
		throw new AppError("UNAUTHORIZED", "Account no longer exists");
	}

	return toPublicUser(user);
}
