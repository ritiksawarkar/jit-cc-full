import { Router } from "express";
import { getPublicEventLeaderboard } from "../controllers/eventResultsController.js";

const router = Router();

// GET /api/events/:eventId/leaderboard
router.get("/:eventId/leaderboard", getPublicEventLeaderboard);

export default router;
