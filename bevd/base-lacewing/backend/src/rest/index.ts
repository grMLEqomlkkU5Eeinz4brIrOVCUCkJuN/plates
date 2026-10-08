import type { AppDeps } from "../app";
import { authRoutes } from "./auth";
import { restBase } from "./base";
import { postRoutes } from "./posts";

export { REST_PREFIX } from "./base";

export function restApi(deps: AppDeps) {
	return restBase(deps).use(authRoutes).use(postRoutes);
}
