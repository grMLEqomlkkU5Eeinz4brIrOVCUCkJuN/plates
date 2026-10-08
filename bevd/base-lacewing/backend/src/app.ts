import { cors } from "@elysiajs/cors";
import { ScalarRender } from "@elysiajs/openapi/scalar";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Elysia } from "elysia";
import { env } from "./config/env";
import type { Database } from "./db";
import { requestContext } from "./http/request";
import { type Logger, requestIdFrom } from "./lib/logger";
import { buildOpenApiDocument } from "./openapi";
import { restApi } from "./rest";
import { createContextFactory } from "./trpc/context";
import { appRouter } from "./trpc/routers";

/**
 * Both doors take the same two things - see createGrpcServer, which takes this same shape.
 * The logger is injected rather than imported so a test can pass a silent one, and so
 * neither transport quietly depends on a module-level singleton the way the database
 * deliberately does not.
 */
export interface AppDeps {
	db: Database;
	log: Logger;
}

export function createApp({ db, log: root }: AppDeps) {
	return (
		new Elysia()
			.use(cors({ origin: env.CORS_ORIGIN, credentials: true }))

			// Elysia's own surface: a request id per call, echoed back so a client can quote
			// it, and one access line. /trpc is skipped here - it logs itself, per procedure,
			// which is strictly more useful. See the note on `.mount` below.
			.use(requestContext)
			.onAfterHandle(({ set, requestId }) => {
				set.headers["x-request-id"] = requestId;
			})
			.onAfterResponse(({ request, set, requestId, startedAt, path }) => {
				if (path.startsWith("/trpc")) return;

				root.info(
					{
						requestId,
						transport: "http",
						method: request.method,
						path,
						status: set.status,
						durationMs: Math.round(performance.now() - startedAt),
					},
					"http",
				);
			})

			// REST twins of the core procedures, under /api/v1. They map and log their own
			// errors, so they are mounted before the catch-all below - an Elysia hook only
			// reaches routes registered after it.
			.use(restApi({ db, log: root }))

			.onError(({ code, error, path, requestId }) => {
				root.error({ requestId, code, path, err: error }, "unhandled request error");
			})

			// A plain Elysia route. Elysia and tRPC share the same server - use plain routes
			// for what a load balancer hits directly.
			.get("/health", () => ({ status: "ok", uptime: process.uptime() }))

			// The OpenAPI document, built from src/openapi/ - the same document `bun run openapi`
			// commits as openapi.json - and a Scalar page over it. @elysiajs/openapi supplies
			// only the page: its plugin generates a document from the routes it can see and
			// merges in whatever it is given, so it cannot serve this one unaltered. Outside
			// production only, like the plugin's default.
			.use((app) => {
				if (env.NODE_ENV === "production") return app;

				const document = buildOpenApiDocument();
				const page = ScalarRender(document.info, { url: "/docs.json" });

				return app
					.get("/docs.json", () => document)
					.get(
						"/docs",
						() =>
							new Response(page, {
								headers: { "content-type": "text/html; charset=utf-8" },
							}),
					);
			})

			// Everything under /trpc is handed to tRPC's fetch adapter.
			//
			// `.mount` hands over the untouched Request, which is what a tRPC mutation needs
			// - Elysia parses the body of a POST before a normal handler runs, and tRPC would
			// then find the stream already consumed.
			//
			// It also strips the prefix, so the adapter sees `/post.create`, not
			// `/trpc/post.create`. Hence `endpoint: ""` - tRPC slices the endpoint off the
			// path to find the procedure name, and there is nothing left to slice. Setting it
			// to "/trpc" here silently 404s every call.
			//
			// And it rebuilds the Request, so the object Elysia's hooks saw is not the one
			// arriving here: no per-request state can be handed across. The request id is
			// therefore re-derived from the header, which is the one thing that does survive.
			.mount("/trpc", (request: Request) => {
				const requestId = requestIdFrom(request.headers.get("x-request-id"));
				const log = root.child({ requestId, transport: "trpc" });

				return fetchRequestHandler({
					endpoint: "",
					req: request,
					router: appRouter,
					createContext: (options) => {
						options.resHeaders.set("x-request-id", requestId);

						return createContextFactory({ db, requestId, log })(options);
					},
					// The per-procedure middleware logs everything that reaches a resolver.
					// This catches what does not: an unknown procedure, a malformed body.
					onError({ error, path }) {
						if (error.code === "INTERNAL_SERVER_ERROR") {
							log.error({ procedure: path ?? "<none>", err: error }, "trpc failed");
						} else {
							log.info(
								{ procedure: path ?? "<none>", code: error.code },
								"trpc rejected",
							);
						}
					},
				});
			})
	);
}

export type App = ReturnType<typeof createApp>;
