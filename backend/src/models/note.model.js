import mongoose from "mongoose";

/**
 * A shared "family board" note. Think of it as a tiny wiki for the household:
 * WiFi password, emergency contacts, house rules, gate codes, etc.
 */
const noteSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, default: "", trim: true, maxlength: 4000 },

    category: {
      type: String,
      enum: ["info", "contact", "rule", "address", "reminder"],
      default: "info",
      index: true,
    },

    pinned: { type: Boolean, default: false },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

noteSchema.index({ pinned: -1, updatedAt: -1 });

const Note = mongoose.model("Note", noteSchema);

export default Note;
