import type { Post } from "../db/schema";

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
		created_at: post.createdAt.toISOString(),
		updated_at: post.updatedAt.toISOString(),
	};
}
