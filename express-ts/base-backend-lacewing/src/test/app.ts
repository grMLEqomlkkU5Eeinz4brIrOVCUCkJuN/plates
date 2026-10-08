import express, { type Express } from "express";

import { createApp } from "../app";
import { responseCheck } from "../openapi/responseCheck";

/** The real app, behind a check that every JSON response matches its description. */
export const createTestApp = (): Express => {
	const app = express();
	app.use(responseCheck);
	app.use(createApp());
	return app;
};
