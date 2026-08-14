import { ref } from "vue";
import { trpc } from "../lib/trpc";
import { useAsync } from "./useAsync";

/** No hand-written Post interface: the type comes back from the router. */
export type Post = Awaited<ReturnType<typeof trpc.post.list.query>>[number];

/**
 * Everything the posts UI does with the server, with no markup in sight.
 *
 * This is the frontend's version of the split the backend makes between a router and a
 * service: the component renders and collects input, and this decides what to ask for and
 * what to do with the answer. `lib/trpc` is imported by composables only, so there is
 * exactly one layer that knows how the app talks to a server.
 *
 * State is per-caller: each PostsPanel gets its own list, and remounting one starts a
 * clean one.
 */
export function usePosts() {
	const { busy, error, run } = useAsync();

	const posts = ref<Post[]>([]);

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

	return { posts, busy, error, load, create, togglePublished, remove };
}
