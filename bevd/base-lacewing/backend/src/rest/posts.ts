import { type } from "arktype";
import {
	CreatePostInput,
	createPost,
	getPost,
	ListPostsInput,
	listPosts,
	PostIdInput,
} from "../services/post.service";
import { type RestBase, requireSignedIn } from "./base";

/**
 * ListPostsInput, as a query string spells it.
 *
 * A query string carries only text, and ListPostsInput takes a number and a boolean, so
 * this decodes first. The range is ListPostsInput's own `limit` node rather than a second
 * copy of "1 to 100", and listPosts still validates the decoded result with
 * ListPostsInput itself - the rule lives in one place.
 */
export const ListPostsQuery = type({
	"limit?": type("string.integer.parse")
		.to(ListPostsInput.get("limit"))
		.describe("an integer from 1 to 100 (20 when absent)"),
	"publishedOnly?": type("'true' | 'false'").pipe((flag) => flag === "true"),
});

/** list/byId/create from trpc/routers/post.ts. Who may see a draft is listPosts' call. */
export function postRoutes(app: RestBase) {
	return app
		.get("/posts", ({ service, query }) => listPosts(service, query), { query: ListPostsQuery })
		.get("/posts/:id", ({ service, params }) => getPost(service, params), {
			params: PostIdInput,
		})
		.post(
			"/posts",
			async ({ service, body, set }) => {
				const post = await createPost(service, body);

				set.status = 201;

				return post;
			},
			{ body: CreatePostInput, transform: requireSignedIn },
		);
}
