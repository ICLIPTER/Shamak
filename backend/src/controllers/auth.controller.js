import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import User from "../models/user.model.js";
import Invite from "../models/invite.model.js";
import { emitToUser } from "../lib/socket.js";
import { invalidateUserCache } from "../middleware/auth.middleware.js";
import {
  ACCESS_COOKIE_NAME,
  refreshCookieOptions,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../lib/token.js";

const IS_PROD = process.env.NODE_ENV === "production";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---- Owner recovery ---------------------------------------------------------
// THE owner's credentials live in the environment, so they exist
// independently of the database: even if the admin account gets deleted,
// logging in with these restores it as an approved family admin.

function timingSafeEqualStrings(a, b) {
  const bufferA = Buffer.from(String(a));
  const bufferB = Buffer.from(String(b));
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

/** True when the email is the reserved owner email. */
export function isOwnerEmail(email) {
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail || !email) return false;
  return timingSafeEqualStrings(email, ownerEmail.toLowerCase().trim());
}

/** True only when BOTH the owner email AND the owner password match. */
export function isOwnerCredential(email, password) {
  const ownerPassword = process.env.OWNER_PASSWORD;
  if (!ownerPassword || !password) return false;
  return isOwnerEmail(email) && timingSafeEqualStrings(password, ownerPassword);
}

/** (Re)create the owner's account with admin powers. */
async function restoreOwner(email) {
  const existing = await User.findOne({ email });
  if (existing) {
    // The owner logging in with the master password always lands as an
    // approved admin, even if their account was somehow demoted/blocked.
    if (existing.role !== "admin" || existing.isApproved === false) {
      existing.role = "admin";
      existing.isApproved = true;
      await existing.save();
      invalidateUserCache(existing._id);
    }
    return existing;
  }

  const created = await User.create({
    fullName: "Owner",
    email,
    // Store a hash of the owner password too, so normal logins (e.g. after
    // the env var is removed later) keep working.
    passwordHash: await bcrypt.hash(process.env.OWNER_PASSWORD, 10),
    role: "admin",
    isApproved: true,
  });
  invalidateUserCache(created._id);
  return created;
}


function authResponse(res, user, { status = 200 } = {}) {  const accessToken = signAccessToken(user._id);
  res
    .cookie(ACCESS_COOKIE_NAME, signRefreshToken(user._id), {
      ...refreshCookieOptions(IS_PROD),
      path: "/api/auth",
    })
    .status(status)
    .json({
      token: accessToken,
      user: {
        _id: String(user._id),
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isApproved: user.isApproved !== false,
      },
    });
}

export async function checkAuth(req, res) {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  res.status(200).json({
    ...req.user.toObject(),
    isApproved: req.user.isApproved !== false,
  });
}

export async function register(req, res) {
  try {
    const fullName = String(req.body?.fullName || "").trim().slice(0, 80);
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!fullName) {
      res.status(400).json({ message: "Your name is required" });
      return;
    }
    if (!EMAIL_RE.test(email)) {
      res.status(400).json({ message: "Enter a valid email address" });
      return;
    }
    if (password.length < 8) {
      res
        .status(400)
        .json({ message: "Password needs at least 8 characters" });
      return;
    }

    const existing = await User.findOne({ email }).select("_id");
    if (existing) {
      res
        .status(409)
        .json({ message: "That email already has an account — sign in" });
      return;
    }

    // The owner email is reserved for the master recovery credentials.
    if (isOwnerEmail(email)) {
      res
        .status(409)
        .json({ message: "That email is reserved — use the sign-in form" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Port of the old Clerk webhook rules:
    // 1. The very first account becomes the approved family admin.
    // 2. Otherwise a valid, unused invite for this email grants access.
    // 3. Anyone else waits for admin approval.
    const approvedCount = await User.countDocuments({
      isApproved: { $ne: false },
    });
    const isFirstUser = approvedCount === 0;

    const invite = await Invite.findOne({
      email,
      usedBy: null,
      expiresAt: { $gt: new Date() },
    });

    const user = await User.create({
      fullName,
      email,
      passwordHash,
      isApproved: isFirstUser || Boolean(invite),
      role: isFirstUser || invite?.role === "admin" ? "admin" : "member",
    });

    if (invite) {
      emitToUser(invite.createdBy, "invite:changed", { ok: true });
      invite.usedBy = user._id;
      invite.usedAt = new Date();
      await invite.save();
      await Invite.deleteOne({ _id: invite._id }).catch(() => {});
    }

    authResponse(res, user, { status: 201 });
  } catch (error) {
    console.error("Error in register:", error.message);
    res.status(500).json({ message: "Could not create the account" });
  }
}

export async function login(req, res) {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    // ---- Owner recovery -------------------------------------------------
    // If the owner's account is missing (accidentally dropped from the
    // database), the fixed OWNER_EMAIL + OWNER_PASSWORD credentials in the
    // environment recreate it on the spot, still as the approved admin.
    let user = null;
    if (isOwnerCredential(email, password)) {
      user = await restoreOwner(email);
      if (user) {
        authResponse(res, user);
        return;
      }
    }

    user = await User.findOne({ email }).select(
      "_id fullName email role isApproved passwordHash",
    );

    // Same message for both failures — never confirm whether an email exists.
    const denied = () =>
      res.status(401).json({ message: "Wrong email or password" });

    if (!user || !user.passwordHash) {
      if (user && !user.passwordHash) {
        // Account predates self-hosted auth (migrated or admin-invited).
        res.status(409).json({
          message:
            "This account needs a password yet. A family admin can generate a temporary password from the Family hub.",
          code: "NEEDS_PASSWORD",
        });
        return;
      }
      denied();
      return;
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      denied();
      return;
    }

    authResponse(res, user);
  } catch (error) {
    console.error("Error in login:", error.message);
    res.status(500).json({ message: "Could not sign in" });
  }
}

/** Exchange a valid refresh cookie for a fresh access token (+ rotated cookie). */
export async function refresh(req, res) {
  try {
    const rawCookie = req.cookies?.[ACCESS_COOKIE_NAME];
    if (!rawCookie) {
      res.status(401).json({ message: "No active session" });
      return;
    }

    const payload = verifyRefreshToken(rawCookie);
    if (!payload) {
      res
        .status(401)
        .clearCookie(ACCESS_COOKIE_NAME, { path: "/api/auth" })
        .json({ message: "Session expired" });
      return;
    }

    const user = await User.findById(payload.userId).select(
      "_id fullName email role isApproved",
    );
    if (!user) {
      res.status(401).json({ message: "Session expired" });
      return;
    }

    authResponse(res, user);
  } catch (error) {
    console.error("Error in refresh:", error.message);
    res.status(500).json({ message: "Could not refresh the session" });
  }
}

export async function logout(req, res) {
  res
    .clearCookie(ACCESS_COOKIE_NAME, { path: "/api/auth" })
    .status(200)
    .json({ ok: true });
}
