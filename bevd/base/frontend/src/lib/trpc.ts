import type { AppRouter } from "@bevd/backend/trpc";
import { createTRPCClient, httpBatchLink, type TRPCClient } from "@trpc/client";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

/**
 * `AppRouter` is imported as a type, so none of the server ships to the browser -
 * but every procedure, input and return type below is checked against the real
 * router. Rename a field in the Drizzle schema and this file stops compiling.
 *
 * The explicit `TRPCClient<AppRouter>` annotation is required: without it TypeScript
 * infers a type it cannot name from inside this package and fails with TS2742.
 */
export const trpc: TRPCClient<AppRouter> = createTRPCClient<AppRouter>({
	links: [
		httpBatchLink({
			url: `${API_URL}/trpc`,
			// Harmless here; the JWT template relies on it to send the refresh cookie.
			fetch: (url, options) => fetch(url, { ...options, credentials: "include" }),
		}),
	],
});
