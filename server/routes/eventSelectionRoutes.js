import { Router } from "express";
import {
  getMyJoinedEvents,
  joinEventWithCode,
  getMyProblemSelection,
  lockMyProblemSelection,
  unlockMyProblemSelection,
} from "../controllers/problemSelectionController.js";
import {
  createEvent,
  getEventById,
  listEvents,
  updateEventStatus,
} from "../controllers/adminController.js";
import { listProblemsForEvent } from "../controllers/problemController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = Router();

// POST /api/events/join
router.post("/join", requireAuth, requireRole("student"), joinEventWithCode);

// GET /api/events/my
router.get("/my", requireAuth, requireRole("student"), getMyJoinedEvents);

// GET /api/events
router.get("/", requireAuth, listEvents);

// POST /api/events
router.post("/", requireAuth, requireRole("admin"), createEvent);

// GET /api/events/:eventId/problems
router.get("/:eventId/problems", requireAuth, listProblemsForEvent);

// GET /api/events/:eventId
router.get("/:eventId", requireAuth, getEventById);

// PATCH /api/events/:eventId/status
router.patch(
  "/:eventId/status",
  requireAuth,
  requireRole("admin"),
  updateEventStatus,
);

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
