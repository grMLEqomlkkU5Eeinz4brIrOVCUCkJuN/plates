import {
	CreatePostInput,
	createPost,
	getPost,
	listPosts,
	PostIdInput,
} from "../../services/post.service";
import { type RestApp, signedIn } from "../context";
import { ListPostsQuery } from "../query";

/**
 * The REST twin of trpc/routers/post.ts for reading and creating. Update and delete stay
 * tRPC-only. Visibility (drafts are their author's until published) is the service's
 * call, exactly as it is there.
 */
export function postRoutes(api: RestApp) {
	return api
		.get("/posts", ({ ctx, query }) => listPosts(ctx, query), { query: ListPostsQuery })
		.get("/posts/:id", ({ ctx, params }) => getPost(ctx, params), { params: PostIdInput })
		.post(
			"/posts",
			async ({ ctx, body, set }) => {
				const post = await createPost(ctx, body);

				set.status = 201;

				return post;
			},
			{ body: CreatePostInput, transform: signedIn },
		);
}
