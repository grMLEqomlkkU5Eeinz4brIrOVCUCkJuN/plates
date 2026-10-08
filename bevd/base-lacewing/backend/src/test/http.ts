import { createApp } from "../app";
import type { Database } from "../db";
import { logger } from "../lib/logger";
import { checkResponse } from "../openapi/responseCheck";

/**
 * The app, with every response held against the OpenAPI description on the way out (see
 * openapi/responseCheck.ts). `call` speaks the REST routes the way a client would.
 */
export function checkedApp(db: Database) {
	const app = createApp({ db, log: logger });

	async function handle(request: Request): Promise<Response> {
		const response = await app.handle(request);

		await checkResponse(request, response.clone());

		return response;
	}

	function call(
		method: string,
		path: string,
		{ body, headers = {} }: { body?: unknown; headers?: Record<string, string> } = {},
	): Promise<Response> {
		return handle(
			new Request(`http://localhost${path}`, {
				method,
				headers:
					body === undefined
						? headers
						: { "content-type": "application/json", ...headers },
				body: body === undefined ? undefined : JSON.stringify(body),
			}),
		);
	}

	return { app, handle, call };
}
