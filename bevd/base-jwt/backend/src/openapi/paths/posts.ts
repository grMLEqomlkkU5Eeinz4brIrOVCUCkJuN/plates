import { CreatePostInput, ListPostsInput, PostIdInput } from "../../services/post.service";
import { describeRoutes } from "../registry";
import { PostListSchema, PostSchema } from "../schemas";

describeRoutes([
	{
		method: "get",
		path: "/api/v1/posts",
		operationId: "listPosts",
		summary: "Newest posts first: the published ones, plus your own drafts.",
		description:
			"Anonymous callers see published posts only. A signed-in caller also sees their own drafts, and an admin sees everything. The limit counts only posts the caller may see. Default 20, at most 100.",
		tags: ["Posts"],
		access: "optional",
		procedure: "post.list",
		request: { query: ListPostsInput },
		responses: {
			200: { description: "The posts.", schema: PostListSchema },
			400: "limit is not an integer from 1 to 100, or publishedOnly is not true or false.",
		},
	},
	{
		method: "get",
		path: "/api/v1/posts/:id",
		operationId: "getPost",
		summary: "One post.",
		tags: ["Posts"],
		access: "optional",
		procedure: "post.byId",
		request: { params: PostIdInput },
		responses: {
			200: { description: "The post.", schema: PostSchema },
			400: "The id is not a UUID.",
			404: "No such post, or a draft that is not yours. The two are deliberately indistinguishable.",
		},
	},
	{
		method: "post",
		path: "/api/v1/posts",
		operationId: "createPost",
		summary: "Write a post. The author is the caller, whatever the body says.",
		description: "Not idempotent: sending it twice makes two posts.",
		tags: ["Posts"],
		access: "bearer",
		procedure: "post.create",
		request: { body: CreatePostInput },
		responses: {
			201: {
				description: "The new post, unpublished unless the body said otherwise.",
				schema: PostSchema,
			},
			400: "The body does not match CreatePostInput.",
			401: "Not signed in. Checked before the body is.",
		},
	},
]);
