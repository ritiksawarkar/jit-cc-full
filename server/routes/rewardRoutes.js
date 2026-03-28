import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { claimPrize, getMyPrizes } from "../controllers/prizeController.js";

const router = Router();

router.get("/my-prizes", requireAuth, getMyPrizes);
router.post("/allocations/:allocationId/claim", requireAuth, claimPrize);

export default router;
