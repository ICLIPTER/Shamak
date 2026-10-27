import { getAuth } from "@clerk/express";
import User from "../models/user.model.js";

/**
 * Tiny cache for the per-request user lookup. Every API request resolvers the
 * Clerk session into a User document; naive `findOne` per request doubles the
 * database load. 60 seconds of staleness is harmless for profile data.
 */
const USER_TTL_MS = 60_000;
const userCache = new Map(); // clerkId -> { user, expiresAt }

function getCachedUser(clerkId) {
  const entry = userCache.get(clerkId);
  if (!entry) return null;

  if (entry.expiresAt < Date.now()) {
    userCache.delete(clerkId);
    return null;
  }
  return entry.user;
}

function cacheUser(clerkId, user) {
  userCache.set(clerkId, {
    user,
    expiresAt: Date.now() + USER_TTL_MS,
  });
  // Opportunistic pruning keeps the cache bounded without a background job.
  if (userCache.size > 1000) {
    const now = Date.now();
    for (const [key, entry] of userCache) {
      if (entry.expiresAt < now) userCache.delete(key);
    }
  }
}

/**
 * Drop a cached user so admin actions (approve/reject/role changes) take
 * effect for that person's next request immediately, not up to TTL later.
 */
export function invalidateUserCache(clerkId) {
  if (clerkId) userCache.delete(String(clerkId));
}

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

    const cached = getCachedUser(userId);
    if (cached) {
      req.user = cached;
      next();
      return;
    }

    const user = await User.findOne({ clerkId: userId });

    if (!user) {
      res.status(404).json({ message: "user profile is not synced yet" });
      return;
    }

    cacheUser(userId, user);
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
