import mongoose from "mongoose";

const readSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    lastReadAt: { type: Date, default: new Date(0) },
    muted: { type: Boolean, default: false },
  },
  { _id: false },
);

const lastMessageSchema = new mongoose.Schema(
  {
    text: { type: String, default: "" },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    senderName: { type: String, default: "" },
    kind: {
      type: String,
      enum: ["text", "image", "video", "audio", "poll", "system"],
      default: "text",
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const conversationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["direct", "group"],
      default: "direct",
      index: true,
    },

    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],

    // Direct chats get a stable key ("idA:idB" sorted) so we never duplicate them.
    directKey: {
      type: String,
      default: undefined,
    },

    name: { type: String, default: "", trim: true, maxlength: 80 },
    description: { type: String, default: "", trim: true, maxlength: 500 },
    avatar: { type: String, default: "" },

    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    reads: [readSchema],

    lastMessage: { type: lastMessageSchema, default: null },
    lastMessageAt: { type: Date, default: Date.now, index: true },

    pinnedMessages: [{ type: mongoose.Schema.Types.ObjectId, ref: "Message" }],

    // Optional family-wide defaults for this chat.
    onlyAdminsCanPost: { type: Boolean, default: false },
  },
  { timestamps: true },
);

conversationSchema.index({ members: 1, lastMessageAt: -1 });
conversationSchema.index(
  { directKey: 1 },
  { unique: true, partialFilterExpression: { directKey: { $type: "string" } } },
);

const Conversation = mongoose.model("Conversation", conversationSchema);

export default Conversation;
