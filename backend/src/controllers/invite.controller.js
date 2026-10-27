import Invite from "../models/invite.model.js";
import User from "../models/user.model.js";
import { emitToUser } from "../lib/socket.js";
import { invalidateUserCache } from "../middleware/auth.middleware.js";

/** Notify the inviting admin (if online) that a code changed state. */
function notifyInviteChange(invite) {
  const creatorId = typeof invite?.createdBy === "object"
    ? invite.createdBy?._id
    : invite?.createdBy;
  if (creatorId) emitToUser(creatorId, "invite:changed", { ok: true });
}

/** Consumed codes must not linger on the admin screen. Best-effort removal. */
async function consumeInvite(invite) {
  invite.usedBy = invite.usedBy || null;
  invite.usedAt = invite.usedAt || new Date();
  await invite.save();
  notifyInviteChange(invite);
  return Invite.deleteOne({ _id: invite._id }).catch(() => null);
}

export async function listInvites(req, res) {
  try {
    // Self-healing sweep: consumed or expired codes shouldn't sit on the
    // admin screen (legacy ones predate the delete-on-redeem behavior, and
    // TTL cleanup isn't instant).
    await Invite.deleteMany({
      $or: [
        { usedBy: { $ne: null } },
        { expiresAt: { $ne: null, $lte: new Date() } },
      ],
    });

    const invites = await Invite.find()
      .populate("createdBy", "fullName")
      .populate("usedBy", "fullName")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.status(200).json(
      invites.map((invite) => ({
        _id: String(invite._id),
        code: invite.code,
        email: invite.email,
        role: invite.role,
        used: Boolean(invite.usedBy),
        usedBy: invite.usedBy?.fullName || null,
        usedAt: invite.usedAt,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
        createdBy: invite.createdBy?.fullName || null,
      })),
    );
  } catch (error) {
    console.error("Error in listInvites:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function createInvite(req, res) {
  try {
    const { email = "", role = "member", expiresInDays = 14 } = req.body || {};

    const invite = await Invite.create({
      code: Invite.generateCode(),
      email: String(email || "").trim().toLowerCase(),
      role: role === "admin" ? "admin" : "member",
      createdBy: req.user._id,
      expiresAt: new Date(
        Date.now() + Math.min(Math.max(Number(expiresInDays) || 14, 1), 90) *
          24 *
          60 *
          60 *
          1000,
      ),
    });

    res.status(201).json({
      _id: String(invite._id),
      code: invite.code,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
    });
  } catch (error) {
    console.error("Error in createInvite:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function revokeInvite(req, res) {
  try {
    const invite = await Invite.findById(req.params.id);

    if (!invite) {
      res.status(404).json({ message: "Invite not found" });
      return;
    }

    if (invite.usedBy) {
      res.status(400).json({ message: "This invite was already used" });
      return;
    }

    await Invite.deleteOne({ _id: invite._id });
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error in revokeInvite:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * Redeem an invite. Called by a freshly signed-up user who is still
 * unapproved. Matching is by code, and optionally by email.
 */
export async function redeemInvite(req, res) {
  try {
    const code = String(req.body?.code || "")
      .trim()
      .toUpperCase();

    if (!code) {
      res.status(400).json({ message: "An invite code is required" });
      return;
    }

    const invite = await Invite.findOne({ code });

    if (!invite) {
      res.status(404).json({ message: "That invite code is not valid" });
      return;
    }

    if (invite.usedBy) {
      res.status(400).json({ message: "That invite has already been used" });
      return;
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      res.status(400).json({ message: "That invite has expired" });
      return;
    }

    if (invite.email && invite.email !== req.user.email.toLowerCase()) {
      res
        .status(403)
        .json({ message: "That invite was sent to a different email" });
      return;
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          isApproved: true,
          role: invite.role === "admin" ? "admin" : "member",
        },
      },
      { new: true },
    );

    // The redeemer's own next request must see the unlocked account now.
    invalidateUserCache(req.user._id);

    // Mark used, then remove it from admin lists entirely.
    invite.usedBy = user._id;
    await consumeInvite(invite);

    res.status(200).json({
      _id: String(user._id),
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isApproved: user.isApproved,
    });
  } catch (error) {
    console.error("Error in redeemInvite:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}
