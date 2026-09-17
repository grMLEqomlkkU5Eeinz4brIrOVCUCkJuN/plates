import { isRecordNotFound, isUniqueViolation, prisma } from "../db/prisma";
import { httpError, type HttpError } from "../middleware/errorHandler";
import logger from "../utils/logger";
import {
	toAccount,
	toPublicUser,
	type Account,
	type ListUsersQuery,
	type PublicUser,
	type UpdateAccountInput,
} from "../models/user.model";
import { verifyPassword } from "./password.service";

/**
 * The token is signed and unexpired, but the row is gone: the account was
 * closed after the token was minted. 401 rather than 404, because the caller
 * has no session to speak of, and the cookies should be treated as dead.
 */
const accountGone = (userId: string): HttpError =>
	httpError(401, "This account no longer exists.", {
		errorCode: "UNAUTHENTICATED",
		logContext: { userId },
	});

export const findAccount = async (userId: string): Promise<Account> => {
	const user = await prisma.user.findUnique({ where: { id: userId } });

	if (!user) throw accountGone(userId);

	return toAccount(user);
};

/**
 * The patch is the parsed body of a strict schema, so its keys are the
 * endpoint's allowlist rather than whatever the caller sent. No read before
 * the write: a missing row is P2025 from the driver, and there is no window
 * between a lookup and an update for another request to close the account in.
 */
export const updateAccount = async (
	userId: string,
	patch: UpdateAccountInput
): Promise<Account> => {
	try {
		const user = await prisma.user.update({ where: { id: userId }, data: patch });

		return toAccount(user);
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw httpError(409, "That email address is already registered.", {
				errorCode: "EMAIL_TAKEN",
			});
		}
		if (isRecordNotFound(error)) throw accountGone(userId);
		throw error;
	}
};

/**
 * Closes the account. Final: the row goes, and the refresh tokens go with it
 * by cascade (prisma/schema.prisma), so no session can be renewed. The access
 * token in hand stays valid until it expires, which is the window
 * authenticate accepts by not reading the row.
 *
 * A bearer cookie says this request came from a session somebody opened. It
 * does not say the person at the other end is still the owner, so this asks
 * for the password again.
 */
export const deleteAccount = async (userId: string, password: string): Promise<void> => {
	const user = await prisma.user.findUnique({ where: { id: userId } });

	if (!user) throw accountGone(userId);

	if (!(await verifyPassword(user.passwordHash, password))) {
		throw httpError(401, "Password is incorrect.", {
			errorCode: "INVALID_CREDENTIALS",
			logContext: { userId },
		});
	}

	await prisma.user.delete({ where: { id: userId } });

	logger.info("Account closed", { userId });
};

export const findPublicUser = async (id: string): Promise<PublicUser> => {
	const user = await prisma.user.findUnique({ where: { id } });

	if (!user) {
		throw httpError(404, "No such user.", { errorCode: "NOT_FOUND" });
	}

	return toPublicUser(user);
};

/**
 * Ordered by (createdAt, id) so the order is total and a cursor cannot skip
 * or repeat a row when two accounts share a timestamp. Prisma's cursor is the
 * unique id; it applies the composite order itself. A cursor that names a row
 * which no longer exists yields an empty page rather than an error.
 */
export const listPublicUsers = async (query: ListUsersQuery): Promise<PublicUser[]> => {
	const rows = await prisma.user.findMany({
		take: query.limit,
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
		...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
	});

	return rows.map(toPublicUser);
};
