import { CreatePostInput, ListPostsInput, PostIdInput } from "../models/post";
import { createPost, getPost, listPosts } from "../services/post.service";
import { type RestBase, requireSignedIn } from "./base";

/** list/byId/create from trpc/routers/post.ts. Who may see a draft is listPosts' call. */
export function postRoutes(app: RestBase) {
	return app
		.get("/posts", ({ service, query }) => listPosts(service, query), {
			query: ListPostsInput,
			// A query string is all strings, and ListPostsInput wants a number and a
			// boolean. They are converted here, before validation, so the schema stays the
			// one tRPC uses instead of growing a string-accepting twin. Anything that is not
			// a plain integer or exactly "true"/"false" is left alone and fails validation.
			transform({ query }) {
				const raw: Record<string, unknown> = query;

				if (typeof raw.limit === "string" && /^\d+$/.test(raw.limit)) {
					raw.limit = Number(raw.limit);
				}

				if (raw.publishedOnly === "true" || raw.publishedOnly === "false") {
					raw.publishedOnly = raw.publishedOnly === "true";
				}
			},
		})
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
