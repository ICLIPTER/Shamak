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

const router = express.Router();

router.use(protectRoute);

router.get("/", listConversations);
router.post("/", createConversation);

router.get("/:id", getConversation);
router.patch("/:id", updateConversation);
router.delete("/:id", deleteConversation);

router.post("/:id/members", addMembers);
router.delete("/:id/members/:userId", removeMember);
router.post("/:id/leave", leaveConversation);

router.post("/:id/read", markRead);
router.post("/:id/mute", muteConversation);

router.get("/:id/messages", getMessages);
router.post("/:id/messages", upload.single("media"), sendMessage);
router.get("/:id/pins", getPinnedMessages);

router.post("/:id/polls", createPoll);
router.post("/:id/delivered", markDelivered);

export default router;
