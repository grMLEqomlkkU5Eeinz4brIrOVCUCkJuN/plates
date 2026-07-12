import { join } from "node:path";
import type { ServiceDefinition } from "@grpc/grpc-js";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

// Relative to this file, so it does not matter where the process was launched from -
// backend/, the repo root, or a test runner with a cwd of its own.
const PROTO_PATH = join(import.meta.dirname, "..", "..", "proto", "post.proto");

const definition = protoLoader.loadSync(PROTO_PATH, {
	// Keep snake_case field names exactly as the .proto declares them, so what you
	// read here matches what a Go or Python client sends.
	keepCase: true,
	longs: String,
	enums: String,
	defaults: true,
	oneofs: true,
});

const loaded = grpc.loadPackageDefinition(definition) as unknown as {
	bevd: { post: { v1: { PostService: grpc.ServiceClientConstructor } } };
};

export const PostServiceClient = loaded.bevd.post.v1.PostService;
export const postServiceDefinition: ServiceDefinition = PostServiceClient.service;
