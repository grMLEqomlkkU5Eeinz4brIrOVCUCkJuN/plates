import { CreatePostInput, ListPostsInput, PostIdInput } from "../../models/post";
import { REST_PREFIX } from "../../rest/prefix";
import { describeRoutes } from "../registry";
import { PostView } from "../schemas";

describeRoutes([
	{
		method: "get",
		path: `${REST_PREFIX}/posts`,
		operationId: "getPosts",
		summary: "Newest first: published posts, plus the caller's own drafts (an admin sees all).",
		tags: ["Posts"],
		access: "anyone",
		procedure: "post.list",
		request: { query: ListPostsInput },
		responses: {
			200: { description: "At most `limit` posts.", schema: PostView.array() },
			400: "A query value failed validation.",
		},
	},
	{
		method: "get",
		path: `${REST_PREFIX}/posts/:id`,
		operationId: "getPost",
		summary: "One post.",
		tags: ["Posts"],
		access: "anyone",
		procedure: "post.byId",
		request: { params: PostIdInput },
		responses: {
			200: { description: "The post.", schema: PostView },
			400: "The id is not a UUID.",
			404: "No such post, or a draft the caller may not see - the two are not told apart.",
		},
	},
	{
		method: "post",
		path: `${REST_PREFIX}/posts`,
		operationId: "postPost",
		summary: "Write a post. The author is the caller; the body cannot name another.",
		tags: ["Posts"],
		access: "signedIn",
		procedure: "post.create",
		request: { body: CreatePostInput },
		responses: {
			201: { description: "The post.", schema: PostView },
			400: "The body failed validation.",
			401: "Signed out.",
			403: "A cookie-authenticated request without its CSRF pair.",
		},
	},
]);
