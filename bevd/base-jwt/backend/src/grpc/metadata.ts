import type { Metadata } from "@grpc/grpc-js";
import { verifyAccessToken } from "../auth/jwt";
import type { Actor } from "../auth/policy";

/**
 * The gRPC counterpart of the cookie read in trpc/context.ts.
 *
 * gRPC has no cookies, so the access token arrives as request metadata:
 *
 *   const metadata = new grpc.Metadata();
 *   metadata.set("authorization", `Bearer ${accessToken}`);
 *   client.CreatePost(request, metadata, callback);
 *
 * A missing or rotten token resolves to null - anonymous - and it is the service that
 * decides whether that is good enough (reads: yes; writes: no). Same rules as tRPC,
 * because it is the same service.
 */
export async function actorFromMetadata(metadata: Metadata): Promise<Actor | null> {
	const header = metadata.get("authorization")[0];

	if (typeof header !== "string") return null;

	const token = header.match(/^Bearer (.+)$/i)?.[1];

	if (!token) return null;

	try {
		const payload = await verifyAccessToken(token);

		return { id: payload.sub, email: payload.email, role: payload.role };
	} catch {
		return null;
	}
}
