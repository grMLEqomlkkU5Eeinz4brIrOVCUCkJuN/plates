import type { UserRole } from "../db/schema";

/**
 * Who is making this call. Null means nobody - an anonymous request.
 *
 * The actor is resolved once at the edge (from a cookie over HTTP, from metadata over
 * gRPC) and then handed to services, which is the only thing they know about identity.
 * No service ever sees a token, a header or a cookie.
 */
export interface Actor {
	id: string;
	email: string;
	role: UserRole;
}

/**
 * The rule behind every "you can edit your own, admins can edit anyone" check.
 *
 * This file is deliberately dependency-free - a type import and one pure function, no
 * AppError, no database, nothing from Node. That is what lets the Vue app import it
 * (`@bevd/backend/policy`) to decide which buttons to draw, so the rule exists once
 * rather than being restated in the UI and left to drift. The guards that throw live
 * next door in actor.ts, where the server needs them and the browser does not.
 *
 * The frontend copy is still only a courtesy: the service calls this too, and that call
 * is the one that decides.
 */
export function canMutate(actor: { id: string; role: UserRole }, ownerId: string): boolean {
	return actor.role === "admin" || actor.id === ownerId;
}
