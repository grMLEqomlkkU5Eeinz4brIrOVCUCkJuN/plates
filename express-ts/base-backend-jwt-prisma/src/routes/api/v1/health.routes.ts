import { Router } from "express";
import { getLiveness, getReadiness } from "../../../controllers/health.controller";

const router = Router();

router.get("/", getLiveness);

router.get("/ready", getReadiness);

export default router;
