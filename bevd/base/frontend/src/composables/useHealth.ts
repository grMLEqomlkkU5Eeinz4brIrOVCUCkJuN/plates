import { ref } from "vue";
import { trpc } from "../lib/trpc";

/**
 * The "is the backend there?" line in the header.
 *
 * Small enough to have been three lines inside App.vue, and here for the same reason as
 * usePosts: `lib/trpc` is imported by composables only, so there is exactly one layer
 * that knows how this app talks to a server. Swapping the client, adding a retry, or
 * pointing a component at a fake in a test is a change in one place.
 */
export function useHealth() {
	const status = ref("checking...");

	async function check(): Promise<void> {
		try {
			const { status: ok } = await trpc.health.ping.query();

			status.value = ok;
		} catch {
			status.value = "unreachable - is the backend running?";
		}
	}

	return { status, check };
}
