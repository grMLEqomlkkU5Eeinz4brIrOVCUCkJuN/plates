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
import { restErrors } from "./errors";
import { requestContext } from "./request";

/**
 * REST twins of the three post procedures a non-tRPC client needs first: list, byId and
 * create. post.update and post.delete stay RPC-only (see the README for why).
 *
 * Elysia validates with the very arktype objects the tRPC procedures pass to `.input()`.
 * It accepts Standard Schema, as tRPC does, so there is no second schema to keep in step.
 * The service then validates again with the same objects, exactly as it does under tRPC
 * and gRPC. A route translates HTTP into a service call and decides nothing.
 */
export function postRoutes({ db, log }: AppDeps) {
	return new Elysia({ prefix: "/api/v1" })
		.use(requestContext)
		.use(restErrors(log))
		.resolve(({ requestId }) => ({
			ctx: { db, log: log.child({ requestId, transport: "rest" }) },
		}))
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
			{ body: CreatePostInput },
		);
}
