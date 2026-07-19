import { AuthUser } from "../middleware/auth";

declare global {
	namespace Express {
		interface Request {
			requestId?: string;
			user?: AuthUser;
		}
	}
}

export {};
