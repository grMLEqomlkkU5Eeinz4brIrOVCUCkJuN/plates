import { AppError } from "../lib/errors";
import type { Actor } from "./policy";

export type { Actor } from "./policy";
export { canMutate } from "./policy";

/** Authentication: is there anyone there at all? */
export function requireActor(actor: Actor | null): Actor {
	if (!actor) {
		throw new AppError("UNAUTHORIZED", "You must be signed in");
	}

	return actor;
}

/** Authorization: are they allowed? */
export function requireAdmin(actor: Actor | null): Actor {
	const current = requireActor(actor);

	if (current.role !== "admin") {
		throw new AppError("FORBIDDEN", "Admins only");
	}

	return current;
}
