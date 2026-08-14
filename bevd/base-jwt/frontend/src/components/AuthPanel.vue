<script setup lang="ts">
import { ref } from "vue";
import { useAsync } from "../composables/useAsync";
import { useAuth } from "../composables/useAuth";

const { login, register } = useAuth();

// The server says "Invalid email or password" for both a wrong password and an unknown
// account - deliberately. useAsync shows what it said and does not try to be helpful.
const { busy, error, run } = useAsync("Could not sign in");

const mode = ref<"login" | "register">("login");
const email = ref("");
const name = ref("");
const password = ref("");

async function submit() {
	const ok = await run(async () => {
		if (mode.value === "login") {
			await login(email.value, password.value);
		} else {
			await register(email.value, name.value, password.value);
		}
	});

	if (ok) password.value = "";
}
</script>

<template>
	<section class="auth">
		<div class="tabs">
			<button
				type="button"
				:class="{ active: mode === 'login' }"
				@click="mode = 'login'"
			>
				Sign in
			</button>
			<button
				type="button"
				:class="{ active: mode === 'register' }"
				@click="mode = 'register'"
			>
				Register
			</button>
		</div>

		<form @submit.prevent="submit">
			<input v-model="email" type="email" placeholder="Email" required autocomplete="email" />

			<input
				v-if="mode === 'register'"
				v-model="name"
				placeholder="Name"
				required
				maxlength="100"
			/>

			<input
				v-model="password"
				type="password"
				placeholder="Password"
				required
				minlength="8"
				:autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
			/>

			<button type="submit" :disabled="busy">
				{{ mode === "login" ? "Sign in" : "Create account" }}
			</button>
		</form>

		<p v-if="error" class="error" role="alert">{{ error }}</p>

		<p class="hint">
			Seeded accounts: <code>alice@example.com</code> (admin) and
			<code>bob@example.com</code>, both <code>password123</code>.
		</p>
	</section>
</template>

<style scoped>
.auth {
	display: grid;
	gap: 1rem;
	padding: 1.5rem;
	border: 1px solid var(--border);
	border-radius: 8px;
}

.tabs {
	display: flex;
	gap: 0.5rem;
}

.tabs .active {
	border-color: var(--accent);
	color: var(--accent);
}

form {
	display: grid;
	gap: 0.75rem;
}

.error {
	margin: 0;
	color: #f87171;
}

.hint {
	margin: 0;
	font-size: 0.85rem;
	color: var(--muted);
}
</style>
