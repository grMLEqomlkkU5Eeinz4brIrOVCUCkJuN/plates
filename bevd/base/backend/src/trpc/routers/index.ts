import { router } from "../trpc";
import { healthRouter } from "./health";
import { postRouter } from "./post";

export const appRouter = router({
	health: healthRouter,
	post: postRouter,
});

/** The only thing the frontend imports. It is a type - nothing ships to the browser. */
export type AppRouter = typeof appRouter;
