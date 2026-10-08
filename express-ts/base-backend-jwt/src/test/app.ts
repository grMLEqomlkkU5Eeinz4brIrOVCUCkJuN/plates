import express, { type Express } from "express";

import { createApp } from "../app";
import { responseCheck } from "../openapi/responseCheck";

/**
 * The real app mounted under a wrapper that installs responseCheck first, so
 * every JSON body a test provokes is checked against the route's description.
 */
export const createTestApp = (): Express => {
	const app = express();
	app.use(responseCheck);
	app.use(createApp());
	return app;
};
