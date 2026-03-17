import { Router } from "express";
import { register, login } from "../controllers/authController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = Router();

// POST /api/auth/register
router.post("/register", register);

// POST /api/auth/signup  — alias kept for frontend compatibility
router.post("/signup", register);

// POST /api/auth/login
router.post("/login", login);

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user?.id,
      role: req.user?.role,
      email: req.user?.email,
      name: req.user?.name,
    },
  });
});

// GET /api/auth/admin/check
router.get("/admin/check", requireAuth, requireRole("admin"), (_req, res) => {
  res.json({ ok: true, message: "Admin access granted" });
});

export default router;
