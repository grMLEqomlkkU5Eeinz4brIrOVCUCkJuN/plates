import { type } from "arktype";
import { desc, eq } from "drizzle-orm";
import type { Database } from "../db";
import { type Post, posts } from "../db/schema";
import { AppError, parseInput } from "../lib/errors";

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

export async function listPosts(db: Database, input: unknown): Promise<Post[]> {
	const { limit, publishedOnly } = parseInput(ListPostsInput, input);

	return db.query.posts.findMany({
		where: publishedOnly ? eq(posts.published, true) : undefined,
		orderBy: desc(posts.createdAt),
		limit: limit ?? 20,
	});
}

export async function getPost(db: Database, input: unknown): Promise<Post> {
	const { id } = parseInput(PostIdInput, input);

	const post = await db.query.posts.findFirst({ where: eq(posts.id, id) });

	if (!post) {
		throw new AppError("NOT_FOUND", `No post with id ${id}`);
	}

	return post;
}

export async function createPost(db: Database, input: unknown): Promise<Post> {
	const { title, body, published } = parseInput(CreatePostInput, input);

	const [post] = await db
		.insert(posts)
		.values({ title, body, published: published ?? false })
		.returning();

	if (!post) {
		throw new AppError("INTERNAL", "Insert returned no row");
	}

	return post;
}

export async function updatePost(db: Database, input: unknown): Promise<Post> {
	const { id, ...changes } = parseInput(UpdatePostInput, input);

	if (Object.keys(changes).length === 0) {
		throw new AppError("BAD_REQUEST", "Nothing to update");
	}

	const [post] = await db
		.update(posts)
		.set({ ...changes, updatedAt: new Date() })
		.where(eq(posts.id, id))
		.returning();

	if (!post) {
		throw new AppError("NOT_FOUND", `No post with id ${id}`);
	}

	return post;
}

export async function deletePost(db: Database, input: unknown): Promise<{ id: string }> {
	const { id } = parseInput(PostIdInput, input);

	const [post] = await db.delete(posts).where(eq(posts.id, id)).returning();

	if (!post) {
		throw new AppError("NOT_FOUND", `No post with id ${id}`);
	}

	return { id: post.id };
}
