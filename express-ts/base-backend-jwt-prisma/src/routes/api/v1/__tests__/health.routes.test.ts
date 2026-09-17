import { describe, expect, it, jest } from "@jest/globals";
import request from "supertest";
import * as db from "../../../../db/prisma";
import { createTestApp } from "../../../../test/app";

describe("health routes", () => {
	const app = createTestApp();

	it("GET /api/v1/health answers for the process alone", async () => {
		const response = await request(app).get("/api/v1/health");

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({ status: "ok" });
		// ISO 8601, round-trippable, so a client can compare it to its own clock.
		expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
	});

	it("GET /api/v1/health/ready answers 200 when the database does", async () => {
		const response = await request(app).get("/api/v1/health/ready");

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({ status: "ok", database: "up" });
	});

	it("GET /api/v1/health/ready answers 503 when the database does not", async () => {
		// The database is the one boundary the probe exists to check, so it is
		// the one thing this suite fakes.
		const ping = jest.spyOn(db, "pingDatabase").mockRejectedValueOnce(new Error("ECONNREFUSED"));

		try {
			const response = await request(app).get("/api/v1/health/ready");

			expect(response.status).toBe(503);
			expect(response.body).toMatchObject({
				success: false,
				code: "DEPENDENCY_UNAVAILABLE",
				database: "down",
			});
			expect(typeof response.body.requestId).toBe("string");
		} finally {
			ping.mockRestore();
		}
	});
});
