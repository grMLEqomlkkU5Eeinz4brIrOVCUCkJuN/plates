import type { AuthContext } from "../middleware/auth";

declare global {
	namespace Express {
		interface Request {
			/** Set by the requestId middleware; echoed in logs and error bodies. */
			requestId?: string;
			/** Set by authenticate. Read it through authOf(), which states the
			 *  precondition instead of asserting it away. */
			auth?: AuthContext;
		}
	}
}

export {};
