import express from "express";
import { checkAuth } from "../controllers/auth.controller.js";
import { attachUser } from "../middleware/auth.middleware.js";

const router = express.Router();

// /api/auth/check — returns the family profile, approved or not, so the client
// can show the correct "waiting for approval" screen.
router.get("/check", attachUser, checkAuth);

export default router;
