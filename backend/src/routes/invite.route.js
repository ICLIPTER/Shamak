import express from "express";

import {
  createInvite,
  listInvites,
  redeemInvite,
  revokeInvite,
} from "../controllers/invite.controller.js";
import {
  attachUser,
  protectRoute,
  requireAdmin,
} from "../middleware/auth.middleware.js";

const router = express.Router();

// A pending user must be able to redeem a code, so this route uses the
// non-blocking auth middleware.
router.post("/redeem", attachUser, redeemInvite);

router.use(protectRoute, requireAdmin);
router.get("/", listInvites);
router.post("/", createInvite);
router.delete("/:id", revokeInvite);

export default router;
