import express from "express";

import {
  addMembers,
  createConversation,
  deleteConversation,
  getConversation,
  leaveConversation,
  listConversations,
  markRead,
  muteConversation,
  removeMember,
  updateConversation,
} from "../controllers/conversation.controller.js";
import {
  createPoll,
  getMessages,
  getPinnedMessages,
  markDelivered,
  sendMessage,
} from "../controllers/message.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/upload.middleware.js";
import { uploadLimiter, writeLimiter } from "../middleware/rateLimit.middleware.js";

const router = express.Router();

router.use(protectRoute);

router.get("/", listConversations);
router.post("/", writeLimiter, createConversation);

router.get("/:id", getConversation);
router.patch("/:id", writeLimiter, updateConversation);
router.delete("/:id", writeLimiter, deleteConversation);

router.post("/:id/members", writeLimiter, addMembers);
router.delete("/:id/members/:userId", writeLimiter, removeMember);
router.post("/:id/leave", writeLimiter, leaveConversation);

router.post("/:id/read", markRead);
router.post("/:id/mute", writeLimiter, muteConversation);

router.get("/:id/messages", getMessages);
router.post("/:id/messages", uploadLimiter, upload.single("media"), sendMessage);
router.get("/:id/pins", getPinnedMessages);

router.post("/:id/polls", writeLimiter, createPoll);
router.post("/:id/delivered", markDelivered);

export default router;
