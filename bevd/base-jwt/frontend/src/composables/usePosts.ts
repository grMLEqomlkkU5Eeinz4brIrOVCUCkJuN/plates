import { canMutate } from "@bevd/backend/policy";
import { ref } from "vue";
import { trpc } from "../lib/trpc";
import { useAsync } from "./useAsync";
import { useAuth } from "./useAuth";

/** No hand-written Post interface: the type comes back from the router. */
export type Post = Awaited<ReturnType<typeof trpc.post.list.query>>[number];

/**
 * Everything the posts UI does with the server, with no markup in sight.
 *
 * State is per-caller rather than module-scope (which is what useAuth needs, being one
 * session shared by the whole app): each PostsPanel gets its own list, and remounting it
 * - App.vue keys it on the user - starts a clean one.
 *
 * `posts` is returned as a writable ref rather than wrapped in readonly(): this module is
 * the only thing that can reach it, since the ref is created per call and never escapes
 * anywhere else.
 */
export function usePosts() {
	const { user } = useAuth();
	const { busy, error, run } = useAsync();

	const posts = ref<Post[]>([]);

	/**
	 * The same rule the server enforces, imported from the server rather than restated:
	 * `canMutate` is the function post.service.ts calls. It lives in a dependency-free
	 * module (backend/src/auth/policy.ts) precisely so the browser can have it.
	 *
	 * This still only decides which buttons to draw. The server does not trust it -
	 * deleting someone else's post from the console still comes back FORBIDDEN.
	 */
	function canEdit(post: Post): boolean {
		const current = user.value;

		return current ? canMutate(current, post.authorId) : false;
	}

	// Anonymous callers get published posts; signed-in ones also see their own drafts.
	// Reloading after sign-in is what makes those drafts appear.
	const load = () =>
		run(async () => {
			posts.value = await trpc.post.list.query({ limit: 20 });
		});

	const create = (title: string, body: string) =>
		run(async () => {
			const post = await trpc.post.create.mutate({ title, body });

			posts.value = [post, ...posts.value];
		});

	const togglePublished = (post: Post) =>
		run(async () => {
			const updated = await trpc.post.update.mutate({
				id: post.id,
				published: !post.published,
			});

			posts.value = posts.value.map((p) => (p.id === updated.id ? updated : p));
		});

	const remove = (post: Post) =>
		run(async () => {
			await trpc.post.delete.mutate({ id: post.id });

			posts.value = posts.value.filter((p) => p.id !== post.id);
		});

	return { posts, busy, error, canEdit, load, create, togglePublished, remove };
}
