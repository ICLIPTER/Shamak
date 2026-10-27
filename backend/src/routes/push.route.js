import express from "express";

import {
  getPublicKey,
  subscribe,
  testPush,
  unsubscribe,
} from "../controllers/push.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { writeLimiter } from "../middleware/rateLimit.middleware.js";

const router = express.Router();

router.use(protectRoute);

router.get("/public-key", getPublicKey);
router.post("/subscribe", writeLimiter, subscribe);
router.delete("/subscribe", writeLimiter, unsubscribe);
router.post("/test", writeLimiter, testPush);

export default router;
