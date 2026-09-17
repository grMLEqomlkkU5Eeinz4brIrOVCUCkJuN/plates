import { randomUUID } from "node:crypto";
import { Request, Response, NextFunction } from "express";

const REQUEST_ID_HEADER = "x-request-id";

/** Long enough for a uuid or a trace id, short enough not to be a log payload. */
const MAX_INBOUND_LENGTH = 128;
const SAFE_ID = /^[A-Za-z0-9._-]+$/;

/**
 * Gives every request an id, echoes it back, and lets an upstream proxy's id
 * win so one identifier follows a request across hops.
 *
 * The inbound value is bounded and character-checked because it is written
 * into log lines and returned in an error body: an unchecked header is a way
 * to inject newlines into the log stream.
 */
export const requestId = (req: Request, res: Response, next: NextFunction): void => {
	const inbound = req.get(REQUEST_ID_HEADER);
	const id =
		inbound && inbound.length <= MAX_INBOUND_LENGTH && SAFE_ID.test(inbound)
			? inbound
			: randomUUID();

	req.requestId = id;
	res.setHeader(REQUEST_ID_HEADER, id);
	next();
};
