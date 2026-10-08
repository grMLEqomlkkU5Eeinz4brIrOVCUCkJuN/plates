import { type } from "arktype";
import { REST_PREFIX } from "../rest";
import { type ApiRoute, describedRoutes } from "./registry";
import { ErrorBody } from "./schemas";

/**
 * What keeps the document true at test time: every response a test receives from a
 * described route is held against that route's description. Test-only - src/test/http.ts
 * installs it around app.handle, and src/test/setup.ts fails any test that leaves a
 * violation behind.
 *
 * It reads the serialised Response rather than the handler's return value, so it checks
 * what a client gets, and it sees error bodies too, which Elysia's hooks do not hand over.
 */
export const violations: string[] = [];

function matches(route: ApiRoute, method: string, path: string): boolean {
	if (route.method !== method) return false;

	const want = route.path.split("/");
	const got = path.split("/");

	return (
		want.length === got.length &&
		want.every((segment, i) => (segment.startsWith(":") ? got[i] !== "" : segment === got[i]))
	);
}

export async function checkResponse(
	request: Request,
	response: Pick<Response, "status" | "text">,
): Promise<void> {
	const method = request.method.toLowerCase();
	const { pathname } = new URL(request.url);
	const route = describedRoutes().find((candidate) => matches(candidate, method, pathname));
	const where = `${request.method} ${pathname} -> ${response.status}`;

	if (!route) {
		// /trpc and /docs are not described, and need not be. Anything under the REST prefix
		// must be.
		if (pathname.startsWith(REST_PREFIX)) violations.push(`${where}: no route describes this`);

		return;
	}

	const text = await response.text();
	const declared = route.responses[response.status];
	const isError = response.status >= 400;

	if (declared === undefined && !(isError && response.status === 500)) {
		violations.push(`${where}: status not in the description`);

		return;
	}

	const schema = isError ? ErrorBody : typeof declared === "object" ? declared.schema : undefined;

	if (!schema) {
		if (text !== "") violations.push(`${where}: a body where the description says none`);

		return;
	}

	const result = schema(JSON.parse(text));

	if (result instanceof type.errors) violations.push(`${where}: ${result.summary}`);
}
