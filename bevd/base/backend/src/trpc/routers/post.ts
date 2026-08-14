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
import { publicProcedure, router } from "../trpc";

/**
 * The router is a thin transport layer: every procedure hands straight to the service
 * that the gRPC server also calls. Business rules live in exactly one place.
 *
 * The context goes in whole because a tRPC Context is a superset of ServiceCtx - it has
 * the db and the logger a service is allowed to see, plus transport details (req,
 * resHeaders) that the ServiceCtx parameter type hides from it.
 *
 * The arktype schemas do double duty - tRPC uses them as input parsers (they implement
 * Standard Schema, which tRPC v11 accepts directly), which is what gives the Vue client
 * its argument types.
 */
export const postRouter = router({
	/** trpc.post.list.query({ limit: 10 }) */
	list: publicProcedure.input(ListPostsInput).query(({ ctx, input }) => listPosts(ctx, input)),

	/** trpc.post.byId.query({ id }) */
	byId: publicProcedure.input(PostIdInput).query(({ ctx, input }) => getPost(ctx, input)),

	/** trpc.post.create.mutate({ title, body }) */
	create: publicProcedure
		.input(CreatePostInput)
		.mutation(({ ctx, input }) => createPost(ctx, input)),

	/** trpc.post.update.mutate({ id, title? }) */
	update: publicProcedure
		.input(UpdatePostInput)
		.mutation(({ ctx, input }) => updatePost(ctx, input)),

	/** trpc.post.delete.mutate({ id }) */
	delete: publicProcedure.input(PostIdInput).mutation(({ ctx, input }) => deletePost(ctx, input)),
});
