import { type RestDeps, restContext } from "../context";
import { authRoutes } from "./auth";
import { postRoutes } from "./post";

/** Everything under /api/v1. Mounted by app.ts beside /trpc. */
export function restApi(deps: RestDeps) {
	return restContext(deps).use(authRoutes).use(postRoutes);
}
