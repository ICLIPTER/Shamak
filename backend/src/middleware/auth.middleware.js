import { getAuth } from "@clerk/express";
import User from "../models/user.model.js";

/**
 * Resolves the Clerk session into a family member document.
 * Does NOT enforce approval — used by the auth bootstrap and invite redemption
 * so a pending user can still see their status and enter a code.
 */
export async function attachUser(req, res, next) {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const user = await User.findOne({ clerkId: userId });

    if (!user) {
      res.status(404).json({ message: "user profile is not synced yet" });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Error in attachUser middleware", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * Verifies the Clerk session and requires an approved family member.
 * New sign-ups stay locked out until an admin approves them (or they redeem
 * an invite), so a stray Clerk account can never read family messages.
 */
export async function protectRoute(req, res, next) {
  attachUser(req, res, () => {
    // Existing documents (before approval existed) have no field and stay in.
    if (req.user.isApproved === false) {
      res.status(403).json({
        message: "Your account is waiting for a family admin to approve it.",
        code: "AWAITING_APPROVAL",
      });
      return;
    }

    next();
  });
}

/** Route guard for admin-only actions (approvals, invites, moderation). */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    res.status(403).json({ message: "Only a family admin can do that" });
    return;
  }
  next();
}
