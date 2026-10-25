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

const router = express.Router();

router.use(protectRoute);

// Static paths must come before "/:id".
router.get("/search", searchMessages);
router.get("/album", getAlbum);

router.patch("/:id", editMessage);
router.delete("/:id", deleteMessage);
router.post("/:id/reactions", reactToMessage);
router.post("/:id/vote", votePoll);
router.post("/:id/pin", pinMessage);

export default router;
