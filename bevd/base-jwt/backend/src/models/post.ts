import { type } from "arktype";

/** What the post service accepts. See models/auth.ts for why these live apart. */

export const ListPostsInput = type({
	"limit?": "1 <= number.integer <= 100",
	"publishedOnly?": "boolean",
});

export const PostIdInput = type({ id: "string.uuid" });

export const CreatePostInput = type({
	title: "1 <= string <= 200",
	body: "1 <= string <= 10000",
	"published?": "boolean",
});

export const UpdatePostInput = type({
	id: "string.uuid",
	"title?": "1 <= string <= 200",
	"body?": "1 <= string <= 10000",
	"published?": "boolean",
});
