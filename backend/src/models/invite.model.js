import crypto from "node:crypto";
import mongoose from "mongoose";

const inviteSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Optional: lock the invite to one email address.
    email: { type: String, default: "", lowercase: true, trim: true },

    role: {
      type: String,
      enum: ["admin", "member"],
      default: "member",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    usedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    usedAt: { type: Date, default: null },

    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 1000 * 60 * 60 * 24 * 14), // 14 days
      index: true,
    },
  },
  { timestamps: true },
);

inviteSchema.statics.generateCode = function generateCode() {
  // Human-friendly, unambiguous alphabet (no 0/O/1/I).
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
};

const Invite = mongoose.model("Invite", inviteSchema);

export default Invite;
