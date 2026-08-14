import { ref } from "vue";

/**
 * The busy flag and the error string that every call to the server needs, in one place.
 *
 * One component's worth of try/catch/finally is not much - but the moment a second panel
 * appears it is two copies, each with its own chance to forget to clear the error or to
 * leave the button disabled after a failure. The JWT template has three.
 *
 * The message comes from the server verbatim. tRPC turns a thrown TRPCError back into an
 * Error on the client, and the backend has already decided what a caller may be told -
 * `errorFormatter` in trpc/trpc.ts flattens anything internal to "Internal server error".
 * So there is nothing to interpret here, and interpreting would only risk saying more
 * than the server meant to.
 */
export function useAsync(fallback = "Something went wrong") {
	const busy = ref(false);
	const error = ref<string | null>(null);

	/** Resolves true when the action succeeded, so a caller can clear a form only then. */
	async function run(action: () => Promise<void>): Promise<boolean> {
		busy.value = true;
		error.value = null;

		try {
			await action();

			return true;
		} catch (cause) {
			error.value = cause instanceof Error ? cause.message : fallback;

			return false;
		} finally {
			busy.value = false;
		}
	}

	return { busy, error, run };
}
