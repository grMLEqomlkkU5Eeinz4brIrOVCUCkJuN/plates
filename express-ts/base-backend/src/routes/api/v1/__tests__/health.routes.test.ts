import request from "supertest";
import { createTestApp } from "../../../../test/app";

describe("GET /api/v1/health", () => {
	const app = createTestApp();

	it("should return status ok", async () => {
		const response = await request(app).get("/api/v1/health");

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({
			status: "ok",
		});
		expect(response.body.timestamp).toBeDefined();
	});
});
