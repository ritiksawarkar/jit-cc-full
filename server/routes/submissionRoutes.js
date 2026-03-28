import { Router } from "express";
import {
  getSubmissionById,
  getSubmissionByProblem,
  getUserSubmissions,
  reevaluateSubmission,
  submitCode,
} from "../controllers/submissionController.js";
import { allowSelfOrAdmin, requireAuth } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

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

// GET /api/submissions/:submissionId
router.get("/:submissionId", requireAuth, getSubmissionById);

// POST /api/submissions/:submissionId/reevaluate
router.post(
  "/:submissionId/reevaluate",
  requireAuth,
  requireRole("admin"),
  reevaluateSubmission,
);

export default router;
