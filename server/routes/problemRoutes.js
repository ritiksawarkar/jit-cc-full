import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  getProblemById,
  listProblems,
} from "../controllers/problemController.js";

const router = Router();

// GET /api/problems
router.get("/", requireAuth, listProblems);

// GET /api/problems/:problemId
router.get("/:problemId", requireAuth, getProblemById);

export default router;
