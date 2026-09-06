import type { Express } from "express";

import { createApp } from "../app";

export const createTestApp = (): Express => createApp();
