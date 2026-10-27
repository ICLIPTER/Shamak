import mongoose from "mongoose";

import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import { emitToConversation, emitToUser, getOnlineUserIds } from "../lib/socket.js";

const MEMBER_FIELDS =
  "fullName profilePic email role birthday relation bio lastSeenAt";

function toObjectId(value) {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
}

export function directKeyFor(idA, idB) {
  return [String(idA), String(idB)].sort().join(":");
}

/** Stable, client-friendly view of a conversation. */
export function serializeConversation(conversation, viewerId) {
  const doc = conversation.toObject ? conversation.toObject() : conversation;

  const members = (doc.members || []).map((member) =>
    member?._id
      ? {
          _id: String(member._id),
          fullName: member.fullName,
          profilePic: member.profilePic,
          email: member.email,
          role: member.role,
          birthday: member.birthday,
          relation: member.relation,
          bio: member.bio,
          lastSeenAt: member.lastSeenAt,
        }
      : { _id: String(member) },
  );

  const peer =
    doc.type === "direct"
      ? members.find((member) => member._id !== String(viewerId)) || null
      : null;

  return {
    _id: String(doc._id),
    type: doc.type,
    name: doc.type === "group" ? doc.name || "Family group" : peer?.fullName || "Direct chat",
    avatar: doc.type === "group" ? doc.avatar || "" : peer?.profilePic || "",
    description: doc.description || "",
    members,
    memberCount: members.length,
    admins: (doc.admins || []).map(String),
    peer,
    lastMessage: doc.lastMessage || null,
    lastMessageAt: doc.lastMessageAt,
    pinnedMessages: (doc.pinnedMessages || []).map(String),
    onlyAdminsCanPost: Boolean(doc.onlyAdminsCanPost),
    unreadCount: doc.unreadCount ?? 0,
    muted: Boolean(doc.muted),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Two cheap queries instead of one-per-conversation. */
async function attachUnreadCounts(conversations, viewerId) {
  if (conversations.length === 0) return conversations;

  const conditions = conversations.map((conversation) => {
    const read = (conversation.reads || []).find(
      (entry) => String(entry.userId) === String(viewerId),
    );
    return {
      conversationId: conversation._id,
      createdAt: { $gt: read?.lastReadAt || new Date(0) },
    };
  });

  const counts = await Message.aggregate([
    {
      $match: {
        $or: conditions,
        senderId: { $ne: viewerId },
        deletedAt: null,
        hiddenFor: { $ne: viewerId },
      },
    },
    { $group: { _id: "$conversationId", count: { $sum: 1 } } },
  ]);

  const byId = new Map(counts.map((row) => [String(row._id), row.count]));

  return conversations.map((conversation) => ({
    ...conversation,
    unreadCount: byId.get(String(conversation._id)) || 0,
    muted: Boolean(
      (conversation.reads || []).find(
        (entry) => String(entry.userId) === String(viewerId),
      )?.muted,
    ),
  }));
}

export async function listConversations(req, res) {
  try {
    const viewerId = req.user._id;

    const conversations = await Conversation.find({ members: viewerId })
      .sort({ lastMessageAt: -1 })
      .limit(200)
      .populate("members", MEMBER_FIELDS)
      .lean();

    const withCounts = await attachUnreadCounts(conversations, viewerId);

    res.status(200).json(
      withCounts.map((conversation) =>
        serializeConversation(conversation, viewerId),
      ),
    );
  } catch (error) {
    console.error("Error in listConversations:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getConversation(req, res) {
  try {
    const { id } = req.params;
    if (!toObjectId(id)) {
      res.status(400).json({ message: "Invalid conversation id" });
      return;
    }

    const conversation = await Conversation.findOne({
      _id: id,
      members: req.user._id,
    }).populate("members", MEMBER_FIELDS);

    if (!conversation) {
      res.status(404).json({ message: "Conversation not found" });
      return;
    }

    res.status(200).json(serializeConversation(conversation, req.user._id));
  } catch (error) {
    console.error("Error in getConversation:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function createConversation(req, res) {
  try {
    const viewerId = req.user._id;
    const { type = "direct", memberIds = [], name = "", description = "" } =
      req.body || {};

    if (!Array.isArray(memberIds)) {
      res.status(400).json({ message: "memberIds must be an array" });
      return;
    }

    const uniqueIds = [
      ...new Set(memberIds.map(String).filter((id) => id !== String(viewerId))),
    ];

    if (type === "direct") {
      if (uniqueIds.length !== 1) {
        res
          .status(400)
          .json({ message: "A direct chat needs exactly one other member" });
        return;
      }

      const otherId = toObjectId(uniqueIds[0]);
      if (!otherId) {
        res.status(400).json({ message: "Invalid member id" });
        return;
      }

      const otherUser = await User.findById(otherId).select("_id");
      if (!otherUser) {
        res.status(404).json({ message: "That family member no longer exists" });
        return;
      }

      const directKey = directKeyFor(viewerId, otherId);

      const existing = await Conversation.findOne({ directKey }).populate(
        "members",
        MEMBER_FIELDS,
      );
      if (existing) {
        res.status(200).json(serializeConversation(existing, viewerId));
        return;
      }

      const conversation = await Conversation.create({
        type: "direct",
        members: [viewerId, otherId],
        directKey,
        createdBy: viewerId,
        reads: [
          { userId: viewerId, lastReadAt: new Date() },
          { userId: otherId, lastReadAt: new Date(0) },
        ],
      }).catch(async (error) => {
        // Two devices can race to create the same DM; the unique index wins
        // and the loser just loads the winner's conversation.
        if (error?.code === 11000) {
          return Conversation.findOne({ directKey });
        }
        throw error;
      });

      if (!conversation) {
        res.status(409).json({ message: "Please try that again" });
        return;
      }

      const populated = await conversation.populate("members", MEMBER_FIELDS);

      emitToUser(otherId, "conversation:new", {
        conversation: serializeConversation(populated, otherId),
      });

      res.status(201).json(serializeConversation(populated, viewerId));
      return;
    }

    // Group chat
    if (uniqueIds.length < 1) {
      res.status(400).json({ message: "Add at least one other member" });
      return;
    }

    const validIds = uniqueIds.map(toObjectId).filter(Boolean);
    const members = [viewerId, ...validIds];

    const conversation = await Conversation.create({
      type: "group",
      name: String(name || "Family group").slice(0, 80),
      description: String(description || "").slice(0, 500),
      members,
      admins: [viewerId],
      createdBy: viewerId,
      reads: members.map((memberId) => ({
        userId: memberId,
        lastReadAt: memberId.equals(viewerId) ? new Date() : new Date(0),
      })),
    });

    const populated = await conversation.populate("members", MEMBER_FIELDS);

    const systemMessage = await Message.create({
      conversationId: conversation._id,
      senderId: viewerId,
      text: `${req.user.fullName} created "${populated.name}"`,
      system: true,
    });

    await Conversation.updateOne(
      { _id: conversation._id },
      {
        lastMessage: {
          text: systemMessage.text,
          senderId: viewerId,
          senderName: req.user.fullName,
          kind: "system",
          createdAt: systemMessage.createdAt,
        },
        lastMessageAt: systemMessage.createdAt,
      },
    );

    for (const memberId of members) {
      emitToUser(memberId, "conversation:new", {
        conversation: serializeConversation(populated, memberId),
      });
    }

    res.status(201).json(serializeConversation(populated, viewerId));
  } catch (error) {
    console.error("Error in createConversation:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

async function loadMyConversation(req, res) {
  const conversation = await Conversation.findOne({
    _id: req.params.id,
    members: req.user._id,
  });

  if (!conversation) {
    res.status(404).json({ message: "Conversation not found" });
    return null;
  }

  return conversation;
}

export async function updateConversation(req, res) {
  try {
    const conversation = await loadMyConversation(req, res);
    if (!conversation) return;

    const { name, description, avatar, onlyAdminsCanPost } = req.body || {};

    if (conversation.type === "group") {
      if (typeof name === "string") conversation.name = name.slice(0, 80);
      if (typeof description === "string")
        conversation.description = description.slice(0, 500);
      if (typeof avatar === "string") conversation.avatar = avatar;
    }

    if (typeof onlyAdminsCanPost === "boolean") {
      const isAdmin =
        conversation.admins.some((id) => id.equals(req.user._id)) ||
        req.user.role === "admin";
      if (!isAdmin) {
        res.status(403).json({ message: "Only group admins can change that" });
        return;
      }
      conversation.onlyAdminsCanPost = onlyAdminsCanPost;
    }

    await conversation.save();

    const populated = await conversation.populate("members", MEMBER_FIELDS);
    emitToConversation(conversation._id, "conversation:updated", {
      conversation: serializeConversation(populated, req.user._id),
    });

    res.status(200).json(serializeConversation(populated, req.user._id));
  } catch (error) {
    console.error("Error in updateConversation:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function addMembers(req, res) {
  try {
    const conversation = await loadMyConversation(req, res);
    if (!conversation) return;

    const { memberIds = [] } = req.body || {};
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      res.status(400).json({ message: "memberIds is required" });
      return;
    }

    const existingIds = new Set(conversation.members.map(String));
    const newIds = memberIds
      .map(toObjectId)
      .filter((id) => id && !existingIds.has(String(id)));

    if (newIds.length === 0) {
      res.status(200).json(serializeConversation(conversation, req.user._id));
      return;
    }

    conversation.members.push(...newIds);
    for (const id of newIds) {
      conversation.reads.push({ userId: id, lastReadAt: new Date(0) });
    }
    await conversation.save();

    const populated = await conversation.populate("members", MEMBER_FIELDS);

    const names = populated.members
      .filter((member) => newIds.some((id) => id.equals(member._id)))
      .map((member) => member.fullName)
      .join(", ");

    const systemMessage = await Message.create({
      conversationId: conversation._id,
      senderId: req.user._id,
      text: `${req.user.fullName} added ${names}`,
      system: true,
    });

    await Conversation.updateOne(
      { _id: conversation._id },
      {
        lastMessage: {
          text: systemMessage.text,
          senderId: req.user._id,
          senderName: req.user.fullName,
          kind: "system",
          createdAt: systemMessage.createdAt,
        },
        lastMessageAt: systemMessage.createdAt,
      },
    );

    for (const memberId of populated.members) {
      emitToUser(memberId._id, "conversation:new", {
        conversation: serializeConversation(populated, memberId._id),
      });
    }
    emitToConversation(conversation._id, "message:new", {
      message: systemMessage,
      conversationId: String(conversation._id),
    });

    res.status(200).json(serializeConversation(populated, req.user._id));
  } catch (error) {
    console.error("Error in addMembers:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function removeMember(req, res) {
  try {
    const conversation = await loadMyConversation(req, res);
    if (!conversation) return;

    const isAdmin = conversation.admins.some((id) => id.equals(req.user._id));
    if (!isAdmin && req.user.role !== "admin") {
      res.status(403).json({ message: "Only group admins can remove members" });
      return;
    }

    const targetId = toObjectId(req.params.userId);
    if (!targetId) {
      res.status(400).json({ message: "Invalid member id" });
      return;
    }

    conversation.members = conversation.members.filter(
      (id) => !id.equals(targetId),
    );
    conversation.admins = conversation.admins.filter((id) => !id.equals(targetId));
    conversation.reads = conversation.reads.filter(
      (read) => !read.userId.equals(targetId),
    );

    await conversation.save();

    const populated = await conversation.populate("members", MEMBER_FIELDS);

    emitToUser(targetId, "conversation:removed", {
      conversationId: String(conversation._id),
    });
    emitToConversation(conversation._id, "conversation:updated", {
      conversation: serializeConversation(populated, req.user._id),
    });

    res.status(200).json(serializeConversation(populated, req.user._id));
  } catch (error) {
    console.error("Error in removeMember:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function leaveConversation(req, res) {
  try {
    const conversation = await loadMyConversation(req, res);
    if (!conversation) return;

    conversation.members = conversation.members.filter(
      (id) => !id.equals(req.user._id),
    );
    conversation.admins = conversation.admins.filter(
      (id) => !id.equals(req.user._id),
    );
    conversation.reads = conversation.reads.filter(
      (read) => !read.userId.equals(req.user._id),
    );

    // Hand admin to the next member if the last admin left.
    if (conversation.admins.length === 0 && conversation.members.length > 0) {
      conversation.admins = [conversation.members[0]];
    }

    if (conversation.members.length === 0) {
      await Conversation.deleteOne({ _id: conversation._id });
      await Message.deleteMany({ conversationId: conversation._id });
    } else {
      await conversation.save();
    }

    emitToConversation(conversation._id, "conversation:removed", {
      conversationId: String(conversation._id),
    });

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error in leaveConversation:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function deleteConversation(req, res) {
  try {
    const conversation = await loadMyConversation(req, res);
    if (!conversation) return;

    const isAdmin = conversation.admins.some((id) => id.equals(req.user._id));
    if (!isAdmin && req.user.role !== "admin") {
      res
        .status(403)
        .json({ message: "Only group admins can delete this conversation" });
      return;
    }

    for (const memberId of conversation.members) {
      emitToUser(memberId, "conversation:removed", {
        conversationId: String(conversation._id),
      });
    }

    await Message.deleteMany({ conversationId: conversation._id });
    await Conversation.deleteOne({ _id: conversation._id });

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error in deleteConversation:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function markRead(req, res) {
  try {
    const conversation = await loadMyConversation(req, res);
    if (!conversation) return;

    const now = new Date();

    const existing = conversation.reads.find((read) =>
      read.userId.equals(req.user._id),
    );
    if (existing) existing.lastReadAt = now;
    else conversation.reads.push({ userId: req.user._id, lastReadAt: now });

    // One small write to one document. (Read receipts used to fan out over
    // every unread message here — that multiplied writes per chat open.)
    await conversation.save();

    // Clients compute their own ticks from this event + conversation.reads.
    emitToConversation(conversation._id, "conversation:read", {
      conversationId: String(conversation._id),
      userId: String(req.user._id),
      at: now,
    });

    res.status(200).json({ ok: true, at: now });
  } catch (error) {
    console.error("Error in markRead:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function muteConversation(req, res) {
  try {
    const conversation = await loadMyConversation(req, res);
    if (!conversation) return;

    const { muted } = req.body || {};
    const entry = conversation.reads.find((read) =>
      read.userId.equals(req.user._id),
    );

    if (entry) entry.muted = Boolean(muted);
    else
      conversation.reads.push({
        userId: req.user._id,
        lastReadAt: new Date(0),
        muted: Boolean(muted),
      });

    await conversation.save();
    res.status(200).json({ ok: true, muted: Boolean(muted) });
  } catch (error) {
    console.error("Error in muteConversation:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getOnlineMembers(req, res) {
  res.status(200).json({ online: getOnlineUserIds() });
}
