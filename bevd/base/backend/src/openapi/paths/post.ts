import { type } from "arktype";
import { CreatePostInput, ListPostsInput, PostIdInput } from "../../services/post.service";
import { describeRoutes, named } from "../registry";

/**
 * What the services return, which is a row of db/schema.ts. The dates are checked as Date
 * because the response check runs before Elysia serialises the body; the document says
 * ISO 8601 string, which is what the client receives. Extra keys are rejected so a new
 * column cannot reach clients without reaching this description first.
 */
const Post = named(
	"Post",
	type({
		"+": "reject",
		id: "string.uuid",
		title: "string",
		body: "string",
		published: "boolean",
		createdAt: "Date",
		updatedAt: "Date",
	}),
);

const PostList = named("PostList", Post.array());

const UNAVAILABLE = "The database failed. The body carries the request id and nothing else.";

describeRoutes([
	{
		method: "get",
		path: "/api/v1/posts",
		operationId: "listPosts",
		summary: "Posts, newest first. The REST twin of post.list.",
		description: "limit defaults to 20 and may not exceed 100.",
		tags: ["Posts"],
		request: { query: ListPostsInput },
		responses: {
			200: { description: "At most `limit` posts.", schema: PostList },
			400: "limit is not an integer from 1 to 100, or publishedOnly is not true or false.",
			500: UNAVAILABLE,
		},
	},
	{
		method: "get",
		path: "/api/v1/posts/:id",
		operationId: "getPost",
		summary: "One post. The REST twin of post.byId.",
		tags: ["Posts"],
		request: { params: PostIdInput },
		responses: {
			200: { description: "The post.", schema: Post },
			400: "The id is not a UUID.",
			404: "No post has that id.",
			500: UNAVAILABLE,
		},
	},
	{
		method: "post",
		path: "/api/v1/posts",
		operationId: "createPost",
		summary: "Create a post, unpublished unless told otherwise. The REST twin of post.create.",
		tags: ["Posts"],
		request: { body: CreatePostInput },
		responses: {
			201: { description: "The new post.", schema: Post },
			400: "The body is not JSON, or a field is missing, empty or too long.",
			500: UNAVAILABLE,
		},
	},
]);
