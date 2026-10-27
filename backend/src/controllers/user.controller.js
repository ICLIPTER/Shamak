import User from "../models/user.model.js";
import { emitToUser } from "../lib/socket.js";
import { invalidateUserCache } from "../middleware/auth.middleware.js";

const PUBLIC_FIELDS =
  "fullName profilePic email role birthday relation bio phone lastSeenAt createdAt";

export async function listUsers(req, res) {
  try {
    const users = await User.find({ isApproved: { $ne: false } })
      .select(PUBLIC_FIELDS)
      .sort({ fullName: 1 })
      .lean();

    res.status(200).json(users);
  } catch (error) {
    console.error("Error in listUsers:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function listPendingUsers(req, res) {
  try {
    const users = await User.find({ isApproved: false })
      .select(PUBLIC_FIELDS)
      .sort({ createdAt: 1 })
      .lean();

    res.status(200).json(users);
  } catch (error) {
    console.error("Error in listPendingUsers:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateMe(req, res) {
  try {
    const allowed = [
      "fullName",
      "relation",
      "bio",
      "phone",
      "birthday",
      "profilePic",
    ];
    const updates = {};

    for (const key of allowed) {
      if (req.body?.[key] !== undefined) updates[key] = req.body[key];
    }

    if (updates.fullName !== undefined) {
      updates.fullName = String(updates.fullName).trim().slice(0, 80);
      if (!updates.fullName) {
        res.status(400).json({ message: "Name cannot be empty" });
        return;
      }
    }

    if (updates.bio !== undefined) updates.bio = String(updates.bio).slice(0, 280);
    if (updates.relation !== undefined)
      updates.relation = String(updates.relation).slice(0, 80);
    if (updates.phone !== undefined)
      updates.phone = String(updates.phone).slice(0, 40);

    if (updates.birthday !== undefined) {
      if (!updates.birthday) updates.birthday = null;
      else {
        const date = new Date(updates.birthday);
        if (Number.isNaN(date.getTime())) {
          res.status(400).json({ message: "Invalid birthday" });
          return;
        }
        // Store at UTC noon so the calendar day never drifts by timezone.
        updates.birthday = new Date(
          Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12),
        );
      }
    }

    if (req.body?.preferences) {
      updates.preferences = {
        largeText: Boolean(req.body.preferences.largeText),
        reduceMotion: Boolean(req.body.preferences.reduceMotion),
      };
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true },
    ).select(PUBLIC_FIELDS);

    res.status(200).json(user);
  } catch (error) {
    console.error("Error in updateMe:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function approveUser(req, res) {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { isApproved: true } },
      { new: true },
    ).select(`${PUBLIC_FIELDS} clerkId`);

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    // The person's next request must see isApproved immediately.
    invalidateUserCache(user.clerkId);
    emitToUser(user._id, "account:approved", { ok: true });

    const response = user.toObject();
    delete response.clerkId;
    res.status(200).json(response);
  } catch (error) {
    console.error("Error in approveUser:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function rejectUser(req, res) {
  try {
    const user = await User.findById(req.params.id).select("_id role clerkId");

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    if (user.role === "admin") {
      res.status(400).json({ message: "Admins cannot be removed this way" });
      return;
    }

    await User.deleteOne({ _id: user._id });
    // A deleted account must not keep serving requests from a stale cache.
    invalidateUserCache(user.clerkId);
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error in rejectUser:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function setRole(req, res) {
  try {
    const { role } = req.body || {};
    if (!["admin", "member"].includes(role)) {
      res.status(400).json({ message: "Invalid role" });
      return;
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { role } },
      { new: true },
    ).select(`${PUBLIC_FIELDS} clerkId`);

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    invalidateUserCache(user.clerkId);
    const response = user.toObject();
    delete response.clerkId;
    res.status(200).json(response);
  } catch (error) {
    console.error("Error in setRole:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}
