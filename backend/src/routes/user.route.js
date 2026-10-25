import express from "express";

import {
  approveUser,
  listPendingUsers,
  listUsers,
  rejectUser,
  setRole,
  updateMe,
} from "../controllers/user.controller.js";
import { protectRoute, requireAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protectRoute);

router.get("/", listUsers);
router.patch("/me", updateMe);

router.get("/pending", requireAdmin, listPendingUsers);
router.post("/:id/approve", requireAdmin, approveUser);
router.delete("/:id/reject", requireAdmin, rejectUser);
router.patch("/:id/role", requireAdmin, setRole);

export default router;
