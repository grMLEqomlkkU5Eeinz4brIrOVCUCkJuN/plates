import {
	CreatePostInput,
	createPost,
	deletePost,
	getPost,
	ListPostsInput,
	listPosts,
	PostIdInput,
	UpdatePostInput,
	updatePost,
} from "../../services/post.service";
import { protectedProcedure, publicProcedure, router } from "../trpc";

/**
 * Note which procedures are public and which are not.
 *
 * Reading is public - but the whole `ctx` travels into the service, because *what* you can
 * read depends on who you are (drafts are yours alone until published). Writing needs a
 * session, and who may touch an existing post is the service's call: its author, or an
 * admin. See post.service.ts.
 *
 * The context goes in whole because a tRPC Context is a superset of ServiceCtx - it has
 * the db, the logger and the actor a service is allowed to see, plus transport details
 * (req, resHeaders, csrf) that the ServiceCtx parameter type hides from it.
 */
export const postRouter = router({
	/** trpc.post.list.query({ limit: 10 }) - published posts, plus your own drafts. */
	list: publicProcedure.input(ListPostsInput).query(({ ctx, input }) => listPosts(ctx, input)),

	/** trpc.post.byId.query({ id }) */
	byId: publicProcedure.input(PostIdInput).query(({ ctx, input }) => getPost(ctx, input)),

	/** trpc.post.create.mutate({ title, body }) - author comes from the token. */
	create: protectedProcedure
		.input(CreatePostInput)
		.mutation(({ ctx, input }) => createPost(ctx, input)),

	/** trpc.post.update.mutate({ id, title? }) - yours, or you are an admin. */
	update: protectedProcedure
		.input(UpdatePostInput)
		.mutation(({ ctx, input }) => updatePost(ctx, input)),

	/** trpc.post.delete.mutate({ id }) - yours, or you are an admin. */
	delete: protectedProcedure
		.input(PostIdInput)
		.mutation(({ ctx, input }) => deletePost(ctx, input)),
});
