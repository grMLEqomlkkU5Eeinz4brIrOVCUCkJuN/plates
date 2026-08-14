import type { Post, PublicUser } from "../db/schema";
import type { Session } from "../services/auth.service";

/**
 * The protobuf edge of the gRPC transport: domain objects in, wire shapes out.
 *
 * Two things change at this boundary. Drizzle hands back `Date` objects and protobuf
 * wants RFC 3339 strings; and the .proto files declare snake_case fields, which
 * proto-loader keeps verbatim (`keepCase: true`) so that a Go or Python client sees
 * exactly what the schema says. Neither concern belongs in a service, and neither
 * belongs in the handler that is calling one.
 */
export function toWirePost(post: Post) {
	return {
		id: post.id,
		title: post.title,
		body: post.body,
		published: post.published,
		author_id: post.authorId,
		created_at: post.createdAt.toISOString(),
		updated_at: post.updatedAt.toISOString(),
	};
}

export function toWireUser(user: PublicUser) {
	return {
		id: user.id,
		email: user.email,
		name: user.name,
		role: user.role,
		created_at: user.createdAt.toISOString(),
		updated_at: user.updatedAt.toISOString(),
	};
}

export function toWireSession(session: Session) {
	return {
		user: toWireUser(session.user),
		access_token: session.accessToken,
		refresh_token: session.refreshToken,
	};
}
