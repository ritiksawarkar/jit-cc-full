import { Router } from "express";
import {
  getSubmissionByProblem,
  getUserSubmissions,
  submitCode,
} from "../controllers/submissionController.js";
import { allowSelfOrAdmin, requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

// POST /api/submissions
router.post("/", requireAuth, submitCode);

// GET /api/submissions/user/:userId
router.get(
  "/user/:userId",
  requireAuth,
  allowSelfOrAdmin("userId"),
  getUserSubmissions,
);

// GET /api/submissions/problem/:problemId
router.get("/problem/:problemId", requireAuth, getSubmissionByProblem);

export default router;
