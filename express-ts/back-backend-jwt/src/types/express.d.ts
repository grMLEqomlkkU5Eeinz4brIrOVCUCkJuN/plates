import { JwtPayload } from "../middleware/auth";

declare global {
	namespace Express {
		interface Request {
			requestId?: string;
			user?: JwtPayload;
		}
	}
}

export {};
