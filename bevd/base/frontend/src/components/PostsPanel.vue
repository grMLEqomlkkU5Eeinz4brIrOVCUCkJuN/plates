<script setup lang="ts">
import { onMounted, ref } from "vue";
import { trpc } from "../lib/trpc";

// No hand-written Post interface: the type comes back from the router.
type Post = Awaited<ReturnType<typeof trpc.post.list.query>>[number];

const posts = ref<Post[]>([]);
const title = ref("");
const body = ref("");
const error = ref<string | null>(null);
const loading = ref(false);

async function run(action: () => Promise<void>) {
	loading.value = true;
	error.value = null;

	try {
		await action();
	} catch (cause) {
		error.value = cause instanceof Error ? cause.message : "Something went wrong";
	} finally {
		loading.value = false;
	}
}

const load = () =>
	run(async () => {
		posts.value = await trpc.post.list.query({ limit: 20 });
	});

const create = () =>
	run(async () => {
		const post = await trpc.post.create.mutate({ title: title.value, body: body.value });

		posts.value = [post, ...posts.value];
		title.value = "";
		body.value = "";
	});

const togglePublished = (post: Post) =>
	run(async () => {
		const updated = await trpc.post.update.mutate({ id: post.id, published: !post.published });

		posts.value = posts.value.map((p) => (p.id === updated.id ? updated : p));
	});

const remove = (post: Post) =>
	run(async () => {
		await trpc.post.delete.mutate({ id: post.id });

		posts.value = posts.value.filter((p) => p.id !== post.id);
	});

onMounted(load);
</script>

<template>
	<section class="panel">
		<form class="composer" @submit.prevent="create">
			<input v-model="title" placeholder="Title" required maxlength="200" />
			<textarea v-model="body" placeholder="Body" required rows="3" />
			<button type="submit" :disabled="loading">Create post</button>
		</form>

		<p v-if="error" class="error" role="alert">{{ error }}</p>

		<p v-if="!posts.length && !loading" class="empty">
			No posts yet. Create one, or run <code>bun run db:seed</code>.
		</p>

		<ul class="posts">
			<li v-for="post in posts" :key="post.id">
				<div>
					<strong>{{ post.title }}</strong>
					<span :class="['badge', post.published ? 'live' : 'draft']">
						{{ post.published ? "published" : "draft" }}
					</span>
					<p>{{ post.body }}</p>
				</div>

				<div class="actions">
					<button type="button" :disabled="loading" @click="togglePublished(post)">
						{{ post.published ? "Unpublish" : "Publish" }}
					</button>
					<button type="button" :disabled="loading" @click="remove(post)">Delete</button>
				</div>
			</li>
		</ul>
	</section>
</template>

<style scoped>
.panel {
	display: grid;
	gap: 1.5rem;
}

.composer {
	display: grid;
	gap: 0.75rem;
}

.posts {
	display: grid;
	gap: 0.75rem;
	padding: 0;
	list-style: none;
}

.posts li {
	display: flex;
	justify-content: space-between;
	gap: 1rem;
	padding: 1rem;
	border: 1px solid var(--border);
	border-radius: 8px;
}

.posts p {
	margin: 0.35rem 0 0;
	color: var(--muted);
}

.actions {
	display: flex;
	gap: 0.5rem;
	align-items: flex-start;
}

.badge {
	margin-left: 0.5rem;
	padding: 0.1rem 0.45rem;
	border-radius: 999px;
	font-size: 0.75rem;
}

.badge.live {
	background: #16653480;
}

.badge.draft {
	background: #78350f80;
}

.error {
	color: #f87171;
}

.empty {
	color: var(--muted);
}
</style>
