<script setup lang="ts">
import { onMounted } from "vue";
import PostsPanel from "./components/PostsPanel.vue";
import { useHealth } from "./composables/useHealth";

const { status, check } = useHealth();

onMounted(check);
</script>

<template>
	<main>
		<header>
			<h1>BEVD</h1>
			<p>Bun, Elysia, Vue, and Drizzle, wired together with tRPC.</p>
			<p class="status">backend: {{ status }}</p>
		</header>

		<PostsPanel />
	</main>
</template>

<style scoped>
main {
	max-width: 42rem;
	margin: 0 auto;
	padding: 3rem 1.5rem;
	display: grid;
	gap: 2rem;
}

h1 {
	margin: 0;
}

header p {
	margin: 0.25rem 0 0;
	color: var(--muted);
}

.status {
	font-family: ui-monospace, monospace;
	font-size: 0.85rem;
}
</style>
