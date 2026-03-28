import { Router } from "express";
import {
  getMyJoinedEvents,
  joinEventWithCode,
  getMyProblemSelection,
  lockMyProblemSelection,
  unlockMyProblemSelection,
} from "../controllers/problemSelectionController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = Router();

// POST /api/events/join
router.post("/join", requireAuth, requireRole("student"), joinEventWithCode);

// GET /api/events/my
router.get("/my", requireAuth, requireRole("student"), getMyJoinedEvents);

// GET /api/events/:eventId/problems/my-selection
router.get(
  "/:eventId/problems/my-selection",
  requireAuth,
  requireRole("student"),
  getMyProblemSelection,
);

// POST /api/events/:eventId/problems/my-selection
router.post(
  "/:eventId/problems/my-selection",
  requireAuth,
  requireRole("student"),
  lockMyProblemSelection,
);

// DELETE /api/events/:eventId/problems/my-selection
router.delete(
  "/:eventId/problems/my-selection",
  requireAuth,
  requireRole("student"),
  unlockMyProblemSelection,
);

export default router;
