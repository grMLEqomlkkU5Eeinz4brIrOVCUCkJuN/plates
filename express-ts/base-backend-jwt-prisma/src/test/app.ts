import type { Express } from "express";

import { createApp } from "../app";
import { responseCheck } from "../openapi/responseCheck";

export const createTestApp = (): Express => createApp([responseCheck]);
