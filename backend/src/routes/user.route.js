import express from "express";

import {
  approveUser,
  listPendingUsers,
  listUsers,
  rejectUser,
  resetPassword,
  setRole,
  updateMe,
} from "../controllers/user.controller.js";
import { protectRoute, requireAdmin } from "../middleware/auth.middleware.js";
import { writeLimiter } from "../middleware/rateLimit.middleware.js";

const router = express.Router();

router.use(protectRoute);

router.get("/", listUsers);
router.patch("/me", writeLimiter, updateMe);

router.get("/pending", requireAdmin, listPendingUsers);
router.post("/:id/approve", writeLimiter, requireAdmin, approveUser);
router.post("/:id/reset-password", writeLimiter, requireAdmin, resetPassword);
router.delete("/:id/reject", writeLimiter, requireAdmin, rejectUser);
router.patch("/:id/role", writeLimiter, requireAdmin, setRole);

export default router;
