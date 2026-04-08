import { Router } from "express";
import healthRoutes from "./health.routes";
import userRoutes from "./user.routes";

const router = Router();

router.use("/health", healthRoutes);
router.use("/users", userRoutes);

export default router;
