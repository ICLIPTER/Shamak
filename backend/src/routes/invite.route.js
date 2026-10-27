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
import {
  redeemLimiter,
  writeLimiter,
} from "../middleware/rateLimit.middleware.js";

const router = express.Router();

// A pending user must be able to redeem a code, so this route uses the
// non-blocking auth middleware. Tighter limit: it's the only endpoint where
// guessing a code matters.
router.post("/redeem", redeemLimiter, attachUser, redeemInvite);

router.use(protectRoute, requireAdmin);
router.get("/", listInvites);
router.post("/", writeLimiter, createInvite);
router.delete("/:id", writeLimiter, revokeInvite);

export default router;
