import * as grpc from "@grpc/grpc-js";
import { authHandlers } from "./handlers/auth";
import { postHandlers } from "./handlers/post";
import { userHandlers } from "./handlers/user";
import { authServiceDefinition, postServiceDefinition, userServiceDefinition } from "./proto";
import type { GrpcDeps } from "./unary";

/**
 * Assembly, and nothing else - the gRPC counterpart of trpc/routers/index.ts.
 *
 * Everything with a decision in it lives one level down: wire.ts converts, unary.ts builds
 * the ServiceCtx and maps errors, handlers/ dispatch to services. Adding a service here is
 * one import and one addService.
 *
 * `deps` is passed in rather than imported, exactly as createApp takes them: the logger is
 * the app's, not a module-level singleton this file reached for, so a test can hand it a
 * silent one.
 */
export function createGrpcServer(deps: GrpcDeps): grpc.Server {
	const server = new grpc.Server();

	server.addService(postServiceDefinition, postHandlers(deps));
	server.addService(authServiceDefinition, authHandlers(deps));
	server.addService(userServiceDefinition, userHandlers(deps));

	return server;
}

/** Binds the server. Pass port 0 to get a free one - that is what the tests do. */
export function startGrpcServer(server: grpc.Server, port: number): Promise<number> {
	return new Promise((resolve, reject) => {
		server.bindAsync(
			`0.0.0.0:${port}`,
			grpc.ServerCredentials.createInsecure(),
			(error, boundPort) => (error ? reject(error) : resolve(boundPort)),
		);
	});
}
