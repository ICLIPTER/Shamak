import User from "../models/user.model.js";
import { verifyAccessToken } from "../lib/token.js";

/**
 * Tiny cache for the per-request user lookup. Every API request resolves a
 * JWT into a User document; naive `findOne` per request doubles the database
 * load. 60 seconds of staleness is harmless for profile data.
 */
const USER_TTL_MS = 60_000;
const userCache = new Map(); // user _id -> { user, expiresAt }

function getCachedUser(userId) {
  const entry = userCache.get(userId);
  if (!entry) return null;

  if (entry.expiresAt < Date.now()) {
    userCache.delete(userId);
    return null;
  }
  return entry.user;
}

function cacheUser(userId, user) {
  userCache.set(userId, {
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
export function invalidateUserCache(userId) {
  if (userId) userCache.delete(String(userId));
}

function extractToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return null;
}

/**
 * Resolves the bearer access token into a family member document.
 * Does NOT enforce approval — used by the auth bootstrap and invite redemption
 * so a pending user can still see their status and enter a code.
 */
export async function attachUser(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      // 401 with a code the client understands as "try refresh, then re-login".
      res.status(401).json({ message: "Unauthorized", code: "TOKEN_EXPIRED" });
      return;
    }

    const cached = getCachedUser(payload.userId);
    if (cached) {
      req.user = cached;
      next();
      return;
    }

    const user = await User.findById(payload.userId);

    if (!user) {
      res.status(401).json({ message: "Account no longer exists" });
      return;
    }

    cacheUser(String(user._id), user);
    req.user = user;
    next();
  } catch (error) {
    console.error("Error in attachUser middleware", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * Requires an approved family member. New sign-ups stay locked out until an
 * admin approves them (or they redeem an invite), so a stray account can
 * never read family messages.
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
