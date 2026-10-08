import { Elysia } from "elysia";
import type { AppDeps } from "../app";
import {
	CreatePostInput,
	createPost,
	getPost,
	ListPostsInput,
	listPosts,
	PostIdInput,
} from "../services/post.service";
import { restContext, signedIn } from "./context";
import { restErrors } from "./errors";

/**
 * REST twins of post.list, post.byId and post.create. post.update and post.delete stay
 * RPC-only (see the README for why). Visibility (drafts are their author's until
 * published) is the service's call, exactly as it is under tRPC.
 *
 * Elysia validates with the very arktype objects the tRPC procedures pass to `.input()`;
 * it accepts Standard Schema, as tRPC does. The service then validates again with the same
 * objects, as it does under tRPC and gRPC.
 */
export function postRoutes(deps: AppDeps) {
	return new Elysia({ prefix: "/api/v1" })
		.use(restErrors(deps.log))
		.use(restContext(deps))
		.get("/posts", ({ ctx, query }) => listPosts(ctx, query), {
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
