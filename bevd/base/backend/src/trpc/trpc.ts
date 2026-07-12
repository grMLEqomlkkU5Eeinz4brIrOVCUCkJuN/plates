import { initTRPC, TRPCError } from "@trpc/server";
import { AppError, type ErrorCode } from "../lib/errors";
import type { Context } from "./context";

const TRPC_CODE: Record<ErrorCode, TRPCError["code"]> = {
	BAD_REQUEST: "BAD_REQUEST",
	UNAUTHORIZED: "UNAUTHORIZED",
	FORBIDDEN: "FORBIDDEN",
	NOT_FOUND: "NOT_FOUND",
	CONFLICT: "CONFLICT",
	INTERNAL: "INTERNAL_SERVER_ERROR",
};

const t = initTRPC.context<Context>().create({
	/**
	 * What the client is allowed to be told.
	 *
	 * tRPC's default is to pass a thrown error's message straight through - so an
	 * unhandled Postgres error reaches an anonymous caller as the failing SQL, its
	 * parameters and a stack trace. Internal errors are therefore flattened to a fixed
	 * string here, and the stack is stripped from every response.
	 *
	 * The real error is not lost: it is logged in full, against the same requestId that
	 * is handed back to the caller, so a support ticket maps onto exactly one log line.
	 */
	errorFormatter({ shape, error, ctx }) {
		const isInternal = error.code === "INTERNAL_SERVER_ERROR";
		const { stack: _stack, ...data } = shape.data as typeof shape.data & { stack?: string };

		return {
			...shape,
			message: isInternal ? "Internal server error" : shape.message,
			data: { ...data, requestId: ctx?.requestId },
		};
	},
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

/**
 * One line per procedure call, and the translation of AppError into a tRPC code.
 *
 * Without the mapping tRPC would wrap anything it does not recognise as a 500, so a
 * "no post with that id" would reach the client as an internal error.
 *
 * Note the two log levels: an AppError is the system working (a 404 is not an incident),
 * so it is logged at info. Anything else is a bug, and gets the stack at error.
 */
const observe = t.middleware(async ({ ctx, next, path, type }) => {
	const startedAt = performance.now();
	const result = await next();
	const durationMs = Math.round(performance.now() - startedAt);

	if (result.ok) {
		ctx.log.info({ procedure: path, type, durationMs }, "trpc ok");

		return result;
	}

	const { error } = result;
	const cause = error.cause;

	if (cause instanceof AppError) {
		ctx.log.info({ procedure: path, type, durationMs, code: cause.code }, "trpc rejected");

		throw new TRPCError({ code: TRPC_CODE[cause.code], message: cause.message, cause });
	}

	if (error.code === "INTERNAL_SERVER_ERROR") {
		ctx.log.error({ procedure: path, type, durationMs, err: cause ?? error }, "trpc failed");
	} else {
		// Input that failed validation lands here: expected, and not worth a stack.
		ctx.log.info({ procedure: path, type, durationMs, code: error.code }, "trpc rejected");
	}

	return result;
});

/** Anyone can call this. The JWT template adds `protectedProcedure` and `adminProcedure`. */
export const publicProcedure = t.procedure.use(observe);
