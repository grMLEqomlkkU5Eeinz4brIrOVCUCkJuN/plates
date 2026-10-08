import express, { type Express } from "express";

import { createApp } from "../app";
import { responseCheck } from "../openapi/responseCheck";

// The real app mounted under one that checks every JSON body against the
// route's openapi description; see setup.ts for where violations fail a test.
export const createTestApp = (): Express => {
	const app = express();
	app.use(responseCheck);
	app.use(createApp());
	return app;
};
