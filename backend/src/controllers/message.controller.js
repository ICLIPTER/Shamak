import mongoose from "mongoose";

import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import { hasImageKitConfig, uploadChatMedia } from "../lib/imagekit.js";
import { emitToConversation, emitToUser } from "../lib/socket.js";
import { discardUpload } from "../middleware/upload.middleware.js";
import {
  buildMessagePayload,
  hasPushConfig,
  notifyConversation,
} from "../lib/push.js";

const SENDER_FIELDS = "fullName profilePic";

function toObjectId(value) {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
}

function parseLimit(value, fallback = 50) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, 1), 100);
}

export function serializeMessage(message) {
  const doc = message.toObject ? message.toObject() : message;
  const sender = doc.senderId?._id ? doc.senderId : null;

  return {
    _id: String(doc._id),
    conversationId: String(doc.conversationId),
    senderId: String(sender?._id || doc.senderId),
    sender: sender
      ? {
          _id: String(sender._id),
          fullName: sender.fullName,
          profilePic: sender.profilePic,
        }
      : null,
    text: doc.deletedAt ? "" : doc.text || "",
    image: doc.deletedAt ? "" : doc.image || "",
    video: doc.deletedAt ? "" : doc.video || "",
    audio: doc.deletedAt ? "" : doc.audio || "",
    audioDuration: doc.audioDuration || 0,
    replyTo: doc.replyTo || null,
    reactions: (doc.reactions || []).map((reaction) => ({
      userId: String(reaction.userId),
      emoji: reaction.emoji,
    })),
    readBy: (doc.readBy || []).map((receipt) => ({
      userId: String(receipt.userId),
      at: receipt.at,
    })),
    deliveredTo: (doc.deliveredTo || []).map((receipt) => ({
      userId: String(receipt.userId),
      at: receipt.at,
    })),
    editedAt: doc.editedAt || null,
    deletedAt: doc.deletedAt || null,
    system: Boolean(doc.system),
    poll: doc.poll
      ? {
          question: doc.poll.question,
          multiple: Boolean(doc.poll.multiple),
          closed: Boolean(doc.poll.closed),
          options: (doc.poll.options || []).map((option) => ({
            id: option.id,
            text: option.text,
            votes: (option.votes || []).map(String),
          })),
        }
      : null,
    clientId: doc.clientId || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function lastMessageKind(message) {
  if (message.system) return "system";
  if (message.poll) return "poll";
  if (message.image) return "image";
  if (message.video) return "video";
  if (message.audio) return "audio";
  return "text";
}

async function touchConversation(conversation, message) {
  const preview = message.text?.trim() || "";
  await Conversation.updateOne(
    { _id: conversation._id },
    {
      lastMessage: {
        text: message.system ? preview : preview.slice(0, 160),
        senderId: message.senderId,
        senderName: message.senderName || "",
        kind: lastMessageKind(message),
        createdAt: message.createdAt,
      },
      lastMessageAt: message.createdAt,
    },
  );
}

export async function getMessages(req, res) {
  try {
    const conversationId = toObjectId(req.params.id);
    if (!conversationId) {
      res.status(400).json({ message: "Invalid conversation id" });
      return;
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      members: req.user._id,
    }).select("_id");

    if (!conversation) {
      res.status(404).json({ message: "Conversation not found" });
      return;
    }

    const limit = parseLimit(req.query.limit, 50);
    const query = {
      conversationId,
      hiddenFor: { $ne: req.user._id },
    };

    if (req.query.before) {
      const before = new Date(req.query.before);
      if (!Number.isNaN(before.getTime())) query.createdAt = { $lt: before };
    }

    const docs = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate("senderId", SENDER_FIELDS)
      .lean();

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;

    // Return oldest → newest so the UI can append directly.
    const messages = page.reverse().map(serializeMessage);

    res.status(200).json({
      messages,
      hasMore,
      nextCursor: messages.length > 0 ? messages[0].createdAt : null,
    });
  } catch (error) {
    console.error("Error in getMessages:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function sendMessage(req, res) {
  try {
    const conversationId = toObjectId(req.params.id);
    if (!conversationId) {
      res.status(400).json({ message: "Invalid conversation id" });
      return;
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      members: req.user._id,
    });

    if (!conversation) {
      res.status(404).json({ message: "Conversation not found" });
      return;
    }

    const isGroupAdmin = conversation.admins.some((id) =>
      id.equals(req.user._id),
    );
    if (
      conversation.onlyAdminsCanPost &&
      !isGroupAdmin &&
      req.user.role !== "admin"
    ) {
      res
        .status(403)
        .json({ message: "Only admins can post in this conversation" });
      return;
    }

    const { text = "", clientId, replyToId, audioDuration } = req.body || {};

    const trimmedText = String(text || "").trim().slice(0, 8000);
    const hasMedia = Boolean(req.file);

    if (!trimmedText && !hasMedia) {
      res.status(400).json({ message: "Message cannot be empty" });
      return;
    }

    // Idempotency: a retried send returns the message that already exists.
    if (clientId) {
      const existing = await Message.findOne({
        clientId,
        senderId: req.user._id,
      }).populate("senderId", SENDER_FIELDS);

      if (existing) {
        res.status(200).json(serializeMessage(existing));
        return;
      }
    }

    let image;
    let video;
    let audio;

    if (hasMedia) {
      if (!hasImageKitConfig()) {
        res.status(503).json({ message: "Media storage is not configured" });
        return;
      }

      const url = await uploadChatMedia(req.file);

      if (req.file.kind === "audio") audio = url;
      else if (req.file.mimetype.startsWith("video/")) video = url;
      else image = url;
    }

    let replyTo = null;
    if (replyToId) {
      const original = await Message.findOne({
        _id: toObjectId(replyToId),
        conversationId,
        deletedAt: null,
      }).populate("senderId", SENDER_FIELDS);

      if (original) {
        replyTo = {
          messageId: original._id,
          senderId: original.senderId?._id || original.senderId,
          senderName: original.senderId?.fullName || "",
          text: original.text || "",
          kind: lastMessageKind(original),
        };
      }
    }

    const message = await Message.create({
      conversationId,
      senderId: req.user._id,
      text: trimmedText || undefined,
      image,
      video,
      audio,
      audioDuration: audio ? Number(audioDuration) || 0 : 0,
      replyTo,
      clientId: clientId || undefined,
    });

    const populated = await message.populate("senderId", SENDER_FIELDS);
    const serialized = serializeMessage(populated);

    // Fast path first: broadcast + respond before any side work.
    emitToConversation(conversation._id, "message:new", {
      conversationId: String(conversation._id),
      message: serialized,
    });

    res.status(201).json(serialized);

    // Bulkier side work happens after the response is already on the wire.
    // The conversation preview (uses the populated sender name) and the push
    // fan-out no longer delay the sender's confirmation.
    const previewDoc = {
      ...message.toObject(),
      senderName: req.user.fullName,
    };
    touchConversation(conversation, previewDoc).catch((error) =>
      console.error("Conversation preview update failed:", error.message),
    );

    // Push to offline family members.
    if (hasPushConfig()) {
      notifyConversation(
        conversation,
        req.user._id,
        buildMessagePayload({
          conversation,
          message,
          senderName: req.user.fullName,
        }),
      ).catch((error) => console.error("Push failed:", error.message));
    }
  } catch (error) {
    console.error("Error in sendMessage:", error.message);
    res.status(500).json({ message: "Internal server error" });
  } finally {
    // The multer temp file is no longer needed once this request ends.
    discardUpload(req.file);
  }
}

export async function editMessage(req, res) {
  try {
    const messageId = toObjectId(req.params.id);
    if (!messageId) {
      res.status(400).json({ message: "Invalid message id" });
      return;
    }

    const { text } = req.body || {};
    const trimmed = String(text || "").trim();

    if (!trimmed) {
      res.status(400).json({ message: "Message cannot be empty" });
      return;
    }

    const message = await Message.findById(messageId);

    if (!message || message.deletedAt) {
      res.status(404).json({ message: "Message not found" });
      return;
    }

    if (!message.senderId.equals(req.user._id)) {
      res.status(403).json({ message: "You can only edit your own messages" });
      return;
    }

    const conversation = await Conversation.findOne({
      _id: message.conversationId,
      members: req.user._id,
    });

    if (!conversation) {
      res.status(404).json({ message: "Conversation not found" });
      return;
    }

    message.text = trimmed.slice(0, 8000);
    message.editedAt = new Date();
    await message.save();

    const populated = await message.populate("senderId", SENDER_FIELDS);
    const serialized = serializeMessage(populated);

    emitToConversation(message.conversationId, "message:updated", {
      conversationId: String(message.conversationId),
      message: serialized,
    });

    res.status(200).json(serialized);
  } catch (error) {
    console.error("Error in editMessage:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function deleteMessage(req, res) {
  try {
    const messageId = toObjectId(req.params.id);
    if (!messageId) {
      res.status(400).json({ message: "Invalid message id" });
      return;
    }

    const message = await Message.findById(messageId);
    if (!message) {
      res.status(404).json({ message: "Message not found" });
      return;
    }

    const conversation = await Conversation.findOne({
      _id: message.conversationId,
      members: req.user._id,
    }).select("_id admins type");

    if (!conversation) {
      res.status(404).json({ message: "Conversation not found" });
      return;
    }

    const isOwner = message.senderId.equals(req.user._id);
    const isModerator =
      req.user.role === "admin" ||
      conversation.admins.some((id) => id.equals(req.user._id));

    const forEveryone =
      req.query.forEveryone !== "false" &&
      req.body?.forEveryone !== false;

    // "Delete for me" is always allowed.
    if (!forEveryone) {
      await Message.updateOne(
        { _id: messageId },
        { $addToSet: { hiddenFor: req.user._id } },
      );
      res.status(200).json({ ok: true, forEveryone: false });
      return;
    }

    if (!isOwner && !isModerator) {
      res.status(403).json({ message: "You cannot delete this message" });
      return;
    }

    message.deletedAt = new Date();
    message.text = "";
    message.image = "";
    message.video = "";
    message.audio = "";
    message.poll = null;
    message.reactions = [];
    await message.save();

    const populated = await message.populate("senderId", SENDER_FIELDS);
    emitToConversation(message.conversationId, "message:deleted", {
      conversationId: String(message.conversationId),
      messageId: String(message._id),
      message: serializeMessage(populated),
    });

    res.status(200).json({ ok: true, forEveryone: true });
  } catch (error) {
    console.error("Error in deleteMessage:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function reactToMessage(req, res) {
  try {
    const messageId = toObjectId(req.params.id);
    if (!messageId) {
      res.status(400).json({ message: "Invalid message id" });
      return;
    }

    const emoji = String(req.body?.emoji || "").trim();
    if (!emoji || emoji.length > 8) {
      res.status(400).json({ message: "A single emoji is required" });
      return;
    }

    const message = await Message.findById(messageId);
    if (!message || message.deletedAt) {
      res.status(404).json({ message: "Message not found" });
      return;
    }

    const conversation = await Conversation.findOne({
      _id: message.conversationId,
      members: req.user._id,
    }).select("_id");

    if (!conversation) {
      res.status(404).json({ message: "Conversation not found" });
      return;
    }

    const existingIndex = message.reactions.findIndex(
      (reaction) =>
        reaction.userId.equals(req.user._id) && reaction.emoji === emoji,
    );

    if (existingIndex >= 0) {
      message.reactions.splice(existingIndex, 1);
    } else {
      // One reaction per person per message: swap rather than pile up.
      message.reactions = message.reactions.filter(
        (reaction) => !reaction.userId.equals(req.user._id),
      );
      message.reactions.push({ userId: req.user._id, emoji });
    }

    await message.save();

    const populated = await message.populate("senderId", SENDER_FIELDS);
    const serialized = serializeMessage(populated);

    emitToConversation(message.conversationId, "message:updated", {
      conversationId: String(message.conversationId),
      message: serialized,
    });

    res.status(200).json(serialized);
  } catch (error) {
    console.error("Error in reactToMessage:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function votePoll(req, res) {
  try {
    const messageId = toObjectId(req.params.id);
    const optionId = String(req.body?.optionId || "");

    const message = await Message.findById(messageId);
    if (!message?.poll || message.deletedAt) {
      res.status(404).json({ message: "Poll not found" });
      return;
    }

    const conversation = await Conversation.findOne({
      _id: message.conversationId,
      members: req.user._id,
    }).select("_id");

    if (!conversation) {
      res.status(404).json({ message: "Conversation not found" });
      return;
    }

    if (message.poll.closed) {
      res.status(400).json({ message: "This poll is closed" });
      return;
    }

    const option = message.poll.options.find((entry) => entry.id === optionId);
    if (!option) {
      res.status(400).json({ message: "Unknown poll option" });
      return;
    }

    const alreadyVoted = option.votes.some((id) => id.equals(req.user._id));

    if (!message.poll.multiple) {
      // Single-choice: clear this user from every option first.
      for (const entry of message.poll.options) {
        entry.votes = entry.votes.filter((id) => !id.equals(req.user._id));
      }
    }

    if (!alreadyVoted || message.poll.multiple) {
      if (!option.votes.some((id) => id.equals(req.user._id))) {
        option.votes.push(req.user._id);
      }
    } else {
      option.votes = option.votes.filter((id) => !id.equals(req.user._id));
    }

    message.markModified("poll");
    await message.save();

    const populated = await message.populate("senderId", SENDER_FIELDS);
    const serialized = serializeMessage(populated);

    emitToConversation(message.conversationId, "message:updated", {
      conversationId: String(message.conversationId),
      message: serialized,
    });

    res.status(200).json(serialized);
  } catch (error) {
    console.error("Error in votePoll:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getPinnedMessages(req, res) {
  try {
    const conversationId = toObjectId(req.params.id);
    const conversation = await Conversation.findOne({
      _id: conversationId,
      members: req.user._id,
    }).select("pinnedMessages");

    if (!conversation) {
      res.status(404).json({ message: "Conversation not found" });
      return;
    }

    const messages = await Message.find({
      _id: { $in: conversation.pinnedMessages },
      deletedAt: null,
    })
      .populate("senderId", SENDER_FIELDS)
      .sort({ createdAt: 1 })
      .lean();

    res.status(200).json(messages.map(serializeMessage));
  } catch (error) {
    console.error("Error in getPinnedMessages:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function pinMessage(req, res) {
  try {
    const messageId = toObjectId(req.params.id);
    const message = await Message.findById(messageId).select(
      "_id conversationId",
    );

    if (!message) {
      res.status(404).json({ message: "Message not found" });
      return;
    }

    const conversation = await Conversation.findOne({
      _id: message.conversationId,
      members: req.user._id,
    });

    if (!conversation) {
      res.status(404).json({ message: "Conversation not found" });
      return;
    }

    const isPinned = conversation.pinnedMessages.some((id) =>
      id.equals(messageId),
    );

    if (isPinned) {
      conversation.pinnedMessages = conversation.pinnedMessages.filter(
        (id) => !id.equals(messageId),
      );
    } else {
      conversation.pinnedMessages.push(messageId);
    }

    await conversation.save();

    emitToConversation(conversation._id, "conversation:pins", {
      conversationId: String(conversation._id),
      pinnedMessages: conversation.pinnedMessages.map(String),
    });

    res.status(200).json({
      ok: true,
      pinned: !isPinned,
      pinnedMessages: conversation.pinnedMessages.map(String),
    });
  } catch (error) {
    console.error("Error in pinMessage:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function searchMessages(req, res) {
  try {
    const term = String(req.query.q || "").trim();
    if (term.length < 2) {
      res.status(200).json({ messages: [] });
      return;
    }

    const conversationIds = await Conversation.find({
      members: req.user._id,
    }).distinct("_id");

    if (conversationIds.length === 0) {
      res.status(200).json({ messages: [] });
      return;
    }

    const query = {
      conversationId: { $in: conversationIds },
      deletedAt: null,
      hiddenFor: { $ne: req.user._id },
      text: { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" },
    };

    if (req.query.conversationId && toObjectId(req.query.conversationId)) {
      query.conversationId = toObjectId(req.query.conversationId);
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("senderId", SENDER_FIELDS)
      .lean();

    res.status(200).json(messages.map(serializeMessage));
  } catch (error) {
    console.error("Error in searchMessages:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

/** Shared photo album: every image ever posted, newest first. */
export async function getAlbum(req, res) {
  try {
    const limit = parseLimit(req.query.limit, 60);

    const conversationIds = await Conversation.find({
      members: req.user._id,
    }).distinct("_id");

    if (conversationIds.length === 0) {
      res.status(200).json({ photos: [], hasMore: false, nextCursor: null });
      return;
    }

    const query = {
      conversationId: { $in: conversationIds },
      image: { $exists: true, $nin: ["", null] },
      deletedAt: null,
      hiddenFor: { $ne: req.user._id },
    };

    if (req.query.before) {
      const before = new Date(req.query.before);
      if (!Number.isNaN(before.getTime())) query.createdAt = { $lt: before };
    }

    const docs = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate("senderId", SENDER_FIELDS)
      .lean();

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;

    res.status(200).json({
      photos: page.map((doc) => ({
        _id: String(doc._id),
        image: doc.image,
        conversationId: String(doc.conversationId),
        createdAt: doc.createdAt,
        sender: doc.senderId
          ? {
              _id: String(doc.senderId._id),
              fullName: doc.senderId.fullName,
              profilePic: doc.senderId.profilePic,
            }
          : null,
      })),
      hasMore,
      nextCursor: page.length > 0 ? page[page.length - 1].createdAt : null,
    });
  } catch (error) {
    console.error("Error in getAlbum:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

/** Create a poll as a message inside a conversation. */
export async function createPoll(req, res) {
  try {
    const conversationId = toObjectId(req.params.id);
    const conversation = await Conversation.findOne({
      _id: conversationId,
      members: req.user._id,
    });

    if (!conversation) {
      res.status(404).json({ message: "Conversation not found" });
      return;
    }

    const question = String(req.body?.question || "").trim();
    const rawOptions = Array.isArray(req.body?.options) ? req.body.options : [];
    const options = rawOptions
      .map((option) => String(option || "").trim().slice(0, 120))
      .filter(Boolean)
      .slice(0, 10)
      .map((text, index) => ({ id: `o${index + 1}`, text, votes: [] }));

    if (!question || options.length < 2) {
      res
        .status(400)
        .json({ message: "A poll needs a question and at least 2 options" });
      return;
    }

    const message = await Message.create({
      conversationId,
      senderId: req.user._id,
      poll: {
        question: question.slice(0, 200),
        options,
        multiple: Boolean(req.body?.multiple),
      },
    });

    const populated = await message.populate("senderId", SENDER_FIELDS);
    const serialized = serializeMessage(populated);

    await touchConversation(conversation, {
      text: `📊 ${question}`,
      senderId: req.user._id,
      senderName: req.user.fullName,
      createdAt: message.createdAt,
    });

    emitToConversation(conversation._id, "message:new", {
      conversationId: String(conversation._id),
      message: serialized,
    });

    res.status(201).json(serialized);
  } catch (error) {
    console.error("Error in createPoll:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

/** Mark every message in a conversation as delivered to this user. */
export async function markDelivered(req, res) {
  try {
    const conversationId = toObjectId(req.params.id);
    const conversation = await Conversation.findOne({
      _id: conversationId,
      members: req.user._id,
    }).select("_id");

    if (!conversation) {
      res.status(404).json({ message: "Conversation not found" });
      return;
    }

    const now = new Date();
    await Message.updateMany(
      {
        conversationId,
        senderId: { $ne: req.user._id },
        "deliveredTo.userId": { $ne: req.user._id },
      },
      { $push: { deliveredTo: { userId: req.user._id, at: now } } },
    );

    emitToUser(req.user._id, "messages:delivered", { at: now });

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error in markDelivered:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}
