import express from "express";

import {
  getPublicKey,
  subscribe,
  testPush,
  unsubscribe,
} from "../controllers/push.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protectRoute);

router.get("/public-key", getPublicKey);
router.post("/subscribe", subscribe);
router.delete("/subscribe", unsubscribe);
router.post("/test", testPush);

export default router;
