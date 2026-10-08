import { afterEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import logger from "../../utils/logger";
import { createError, errorHandler } from "../errorHandler";

// No async wrapper on the routes: these pin down that Express 5 itself sends
// a rejected or throwing handler to errorHandler, which logs it.
describe("errorHandler with unwrapped handlers", () => {
	const app = express();
	app.get("/rejects", async () => {
		await Promise.resolve();
		throw new Error("database went away");
	});
	app.get("/throws", () => {
		throw createError(404, "Thing not found");
	});
	app.use(errorHandler);

	const logError = jest.spyOn(logger, "error").mockImplementation(() => logger);

	afterEach(() => {
		logError.mockClear();
	});

	it("turns a rejected async handler into a logged 500", async () => {
		const response = await request(app).get("/rejects");

		expect(response.status).toBe(500);
		expect(response.body).toEqual({
			success: false,
			message: "Internal server error",
		});
		expect(logError.mock.calls).toContainEqual([
			"database went away",
			expect.objectContaining({ statusCode: 500, path: "/rejects", method: "GET" }),
		]);
	});

	it("sends a synchronous http error with its status and message", async () => {
		const response = await request(app).get("/throws");

		expect(response.status).toBe(404);
		expect(response.body).toEqual({ success: false, message: "Thing not found" });
		expect(logError.mock.calls).toContainEqual([
			"Thing not found",
			expect.objectContaining({ statusCode: 404, path: "/throws" }),
		]);
	});
});
