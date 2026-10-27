import express from "express";

import {
  deleteMessage,
  editMessage,
  getAlbum,
  pinMessage,
  reactToMessage,
  searchMessages,
  votePoll,
} from "../controllers/message.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { writeLimiter } from "../middleware/rateLimit.middleware.js";

const router = express.Router();

router.use(protectRoute);

// Static paths must come before "/:id".
router.get("/search", searchMessages);
router.get("/album", getAlbum);

router.patch("/:id", writeLimiter, editMessage);
router.delete("/:id", writeLimiter, deleteMessage);
router.post("/:id/reactions", writeLimiter, reactToMessage);
router.post("/:id/vote", writeLimiter, votePoll);
router.post("/:id/pin", writeLimiter, pinMessage);

export default router;
