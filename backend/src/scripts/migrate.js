import "dotenv/config";
import mongoose from "mongoose";

import { connectDB } from "../lib/db.js";
import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import Conversation from "../models/conversation.model.js";

function directKeyFor(a, b) {
  return [String(a), String(b)].sort().join(":");
}

/**
 * One-time migration from the old 1:1 schema (Message.receiverId) to the
 * conversation-based schema. Safe to run more than once.
 */
async function migrate() {
  await connectDB();

  const legacy = await Message.find({
    conversationId: { $exists: false },
    receiverId: { $exists: true },
  })
    .sort({ createdAt: 1 })
    .lean();

  if (legacy.length === 0) {
    console.log("Nothing to migrate — no legacy messages found.");
    return;
  }

  console.log(`Found ${legacy.length} legacy messages.`);

  const pairs = new Map();

  for (const message of legacy) {
    const key = directKeyFor(message.senderId, message.receiverId);
    if (!pairs.has(key)) {
      pairs.set(key, {
        members: [message.senderId, message.receiverId],
        messages: [],
      });
    }
    pairs.get(key).messages.push(message);
  }

  let migrated = 0;

  for (const [directKey, group] of pairs) {
    const [memberA, memberB] = group.members;

    const conversation = await Conversation.findOneAndUpdate(
      { directKey },
      {
        $setOnInsert: {
          type: "direct",
          members: [memberA, memberB],
          directKey,
          createdBy: memberA,
          reads: [
            { userId: memberA, lastReadAt: new Date() },
            { userId: memberB, lastReadAt: new Date() },
          ],
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const ids = group.messages.map((message) => message._id);

    await Message.updateMany(
      { _id: { $in: ids } },
      { $set: { conversationId: conversation._id } },
    );

    // Raw collection: Mongoose strict mode would drop `receiverId` from the
    // update because the field no longer exists in the schema.
    await Message.collection.updateMany(
      { _id: { $in: ids } },
      { $unset: { receiverId: "" } },
    );

    const last = group.messages[group.messages.length - 1];

    await Conversation.updateOne(
      { _id: conversation._id },
      {
        $set: {
          lastMessage: {
            text: last.text?.slice(0, 160) || "",
            senderId: last.senderId,
            kind: last.image ? "image" : last.video ? "video" : "text",
            createdAt: last.createdAt,
          },
          lastMessageAt: last.createdAt,
        },
      },
    );

    migrated += ids.length;
  }

  // Remove the now-unused index from the old schema if it exists.
  try {
    await Message.collection.dropIndex("receiverId_1");
  } catch {
    /* index already gone */
  }

  console.log(
    `Migration complete: ${migrated} messages across ${pairs.size} conversations.`,
  );
}

migrate()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });

export { migrate };
