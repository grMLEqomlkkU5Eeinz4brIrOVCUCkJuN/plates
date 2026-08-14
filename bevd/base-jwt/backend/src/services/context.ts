import type { Actor } from "../auth/policy";
import type { Database } from "../db";
import type { Logger } from "../lib/logger";

/**
 * Everything a service is allowed to know about the call it is serving.
 *
 * Every service function takes exactly this, then its input: `fn(ctx, input)`. That
 * uniformity is the whole point. The alternative - each function taking whichever of
 * (db, log, actor) it happens to need, in whatever order - means adding a logger to one
 * service is a signature change that ripples through both transports and every test.
 * Here it is already there.
 *
 * Note what is *not* in it: no Request, no Headers, no cookies, no gRPC metadata. A
 * service cannot reach for a transport detail because it was never handed one - the actor
 * is the only thing it learns about who is calling, resolved at the edge from a cookie
 * (trpc/context.ts) or from metadata (grpc/metadata.ts).
 *
 * Both transports' own context types are supersets of this, so they pass themselves
 * straight in: `listPosts(ctx, input)` from a tRPC resolver type-checks because a tRPC
 * Context has these three fields, and the extra ones stay invisible to the service.
 */
export interface ServiceCtx {
	db: Database;
	log: Logger;
	/** Null for an anonymous caller. The service decides whether that is acceptable. */
	actor: Actor | null;
}
