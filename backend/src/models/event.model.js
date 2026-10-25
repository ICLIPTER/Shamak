import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: "", trim: true, maxlength: 500 },

    type: {
      type: String,
      enum: ["birthday", "anniversary", "gathering", "reminder"],
      default: "gathering",
      index: true,
    },

    // Stored as a real date. Birthdays use year 2000 so only month/day matters.
    date: { type: Date, required: true, index: true },

    allDay: { type: Boolean, default: true },

    // Repeats every year (birthdays, anniversaries).
    yearly: { type: Boolean, default: false },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Optional: tie a birthday to the family member it belongs to.
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    reminderDaysBefore: { type: Number, default: 1, min: 0, max: 30 },
    lastRemindedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

eventSchema.index({ date: 1, type: 1 });

const Event = mongoose.model("Event", eventSchema);

export default Event;
