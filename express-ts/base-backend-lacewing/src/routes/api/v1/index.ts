import { Router } from "express";
import healthRoutes from "./health.routes";
import userRoutes from "./user.routes";
import authRoutes from "./auth.routes";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/users", userRoutes);

export default router;
