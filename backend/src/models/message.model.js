import mongoose from "mongoose";

const reactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    emoji: { type: String, required: true, maxlength: 8 },
  },
  { _id: false },
);

const receiptSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const pollOptionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true, maxlength: 120 },
    votes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { _id: false },
);

const pollSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, maxlength: 200 },
    options: [pollOptionSchema],
    multiple: { type: Boolean, default: false },
    closed: { type: Boolean, default: false },
  },
  { _id: false },
);

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },

    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    text: { type: String, maxlength: 8000 },

    image: { type: String },
    video: { type: String },
    audio: { type: String },
    audioDuration: { type: Number, default: 0 },

    // Snapshot of the quoted message so it still renders if the original is deleted.
    replyTo: {
      type: new mongoose.Schema(
        {
          messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
          senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          senderName: { type: String, default: "" },
          text: { type: String, default: "" },
          kind: { type: String, default: "text" },
        },
        { _id: false },
      ),
      default: null,
    },

    reactions: { type: [reactionSchema], default: [] },
    readBy: { type: [receiptSchema], default: [] },
    deliveredTo: { type: [receiptSchema], default: [] },

    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },

    // Per-user "delete for me" without affecting everyone else.
    hiddenFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    system: { type: Boolean, default: false },
    poll: { type: pollSchema, default: null },

    // Optional client id so retries never create duplicate messages.
    clientId: { type: String, default: undefined },
  },
  { timestamps: true },
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ text: "text" });
messageSchema.index({ clientId: 1 }, { sparse: true });

const Message = mongoose.model("Message", messageSchema);

export default Message;
