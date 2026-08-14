<script setup lang="ts">
import { onMounted, ref } from "vue";
import { usePosts } from "../composables/usePosts";

/**
 * Markup, and the two fields the form owns. Everything that talks to the server lives in
 * usePosts.
 */
const { posts, busy, error, load, create, togglePublished, remove } = usePosts();

const title = ref("");
const body = ref("");

async function submit() {
	// Only clear the composer if the post actually landed - otherwise a failed create
	// throws away what the user typed.
	if (await create(title.value, body.value)) {
		title.value = "";
		body.value = "";
	}
}

onMounted(load);
</script>

<template>
	<section class="panel">
		<form class="composer" @submit.prevent="submit">
			<input v-model="title" placeholder="Title" required maxlength="200" />
			<textarea v-model="body" placeholder="Body" required rows="3" />
			<button type="submit" :disabled="busy">Create post</button>
		</form>

		<p v-if="error" class="error" role="alert">{{ error }}</p>

		<p v-if="!posts.length && !busy" class="empty">
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
					<button type="button" :disabled="busy" @click="togglePublished(post)">
						{{ post.published ? "Unpublish" : "Publish" }}
					</button>
					<button type="button" :disabled="busy" @click="remove(post)">Delete</button>
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
