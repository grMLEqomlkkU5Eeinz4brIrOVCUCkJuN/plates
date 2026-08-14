import type { UntypedServiceImplementation } from "@grpc/grpc-js";
import {
	createPost,
	deletePost,
	getPost,
	listPosts,
	updatePost,
} from "../../services/post.service";
import { type GrpcDeps, unary } from "../unary";
import { toWirePost } from "../wire";

interface ListPostsRequest {
	limit?: number;
	published_only?: boolean;
}

interface CreatePostRequest {
	title: string;
	body: string;
	published?: boolean;
}

interface UpdatePostRequest {
	id: string;
	title?: string;
	body?: string;
	published?: boolean;
}

/**
 * The gRPC face of the post service - the counterpart of trpc/routers/post.ts, and just
 * as thin. Both call the same functions; neither decides anything.
 *
 * Note there is no authorization here, and no equivalent of `protectedProcedure`. Who may
 * read a draft or delete a post is settled in post.service.ts, which is the only reason
 * this door can be opened without re-stating every rule.
 */
export function postHandlers(deps: GrpcDeps): UntypedServiceImplementation {
	return {
		ListPosts: unary(deps, "ListPosts", async (ctx, request: ListPostsRequest) => {
			// proto3 sends 0 for an unset int32, which is not a valid limit. The key is
			// spread in only when it is real, never set to undefined: to arktype an optional
			// key means *absent*, and `{ limit: undefined }` is a present key holding an
			// invalid value - it fails validation.
			const limit = request.limit && request.limit > 0 ? { limit: request.limit } : {};

			const rows = await listPosts(ctx, {
				...limit,
				publishedOnly: request.published_only ?? false,
			});

			return { posts: rows.map(toWirePost) };
		}),

		GetPost: unary(deps, "GetPost", async (ctx, request: { id: string }) =>
			toWirePost(await getPost(ctx, request)),
		),

		CreatePost: unary(deps, "CreatePost", async (ctx, request: CreatePostRequest) =>
			toWirePost(await createPost(ctx, request)),
		),

		UpdatePost: unary(deps, "UpdatePost", async (ctx, request: UpdatePostRequest) =>
			toWirePost(await updatePost(ctx, request)),
		),

		DeletePost: unary(deps, "DeletePost", (ctx, request: { id: string }) =>
			deletePost(ctx, request),
		),
	};
}
