import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import {
  getProblemById,
  listAllProblemsForAdmin,
  listProblems,
} from "../controllers/problemController.js";

const router = Router();

// GET /api/problems
router.get("/", requireAuth, listProblems);

// GET /api/problems/all
router.get("/all", requireAuth, requireRole("admin"), listAllProblemsForAdmin);

// GET /api/problems/:problemId
router.get("/:problemId", requireAuth, getProblemById);

export default router;
