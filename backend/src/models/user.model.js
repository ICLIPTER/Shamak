import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    // Legacy Clerk accounts keep this. Self-hosted accounts simply don't have
    // it — sparse lets multiple documents omit the field without colliding.
    clerkId: {
      type: String,
      unique: true,
      sparse: true,
      default: undefined,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    // bcrypt hash; select:false keeps it out of every normal read.
    passwordHash: {
      type: String,
      default: null,
      select: false,
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    profilePic: {
      type: String,
      default: "",
    },

    // "admin" can approve members, create invites, and moderate any message.
    role: {
      type: String,
      enum: ["admin", "member"],
      default: "member",
      index: true,
    },

    // Free-text relationship shown in the family directory, e.g. "Dad's sister".
    relation: {
      type: String,
      default: "",
      trim: true,
    },

    bio: {
      type: String,
      default: "",
      trim: true,
      maxlength: 280,
    },

    phone: {
      type: String,
      default: "",
      trim: true,
    },

    birthday: {
      type: Date,
      default: null,
    },

    // New sign-ups start unapproved; an admin or a valid invite lets them in.
    // Existing documents have no field, so `isApproved !== false` keeps them in.
    isApproved: {
      type: Boolean,
      default: false,
      index: true,
    },

    lastSeenAt: {
      type: Date,
      default: null,
    },

    // Accessibility / comfort preferences that should follow the user across devices.
    preferences: {
      largeText: { type: Boolean, default: false },
      reduceMotion: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

userSchema.index({ fullName: "text", email: "text" });

const User = mongoose.model("User", userSchema);

export default User;
