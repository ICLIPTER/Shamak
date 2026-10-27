import express from "express";
import {
  checkAuth,
  login,
  logout,
  refresh,
  register,
} from "../controllers/auth.controller.js";
import { attachUser } from "../middleware/auth.middleware.js";
import { authLimiter } from "../middleware/rateLimit.middleware.js";

const router = express.Router();

// /api/auth/register + /api/auth/login — brute-force protected.
router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);

// /api/auth/refresh — cookie only, so it cannot be brute-forced via this path.
router.post("/refresh", refresh);
router.post("/logout", logout);

// /api/auth/check — returns the family profile, approved or not, so the client
// can show the correct "waiting for approval" screen.
router.get("/check", attachUser, checkAuth);

export default router;
