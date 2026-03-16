import { Router } from "express";
import { register, login } from "../controllers/authController.js";

const router = Router();

// POST /api/auth/register
router.post("/register", register);

// POST /api/auth/signup  — alias kept for frontend compatibility
router.post("/signup", register);

// POST /api/auth/login
router.post("/login", login);

export default router;
