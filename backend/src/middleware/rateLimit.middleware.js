import rateLimit, { ipKeyGenerator } from "express-rate-limit";

/**
 * Abuse protection, scaled for a private family app.
 *
 * Limits are deliberately generous — the goal is to stop runaway retries,
 * scripted abuse, and accidental overload loops, never real usage. Responds
 * JSON (not HTML) so the client's axios error handling keeps working.
 */

const M = 60 * 1000;

function standardOptions(windowMs, limit) {
  return {
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // Render sits behind one proxy hop; trust proxy is already configured in
    // server.js so req.ip resolves to the real client.
    handler: (_req, res) => {
      res.status(429).json({
        message: "Too many requests — please slow down a little",
      });
    },
  };
}

/** Key by the authenticated family member when known, else by IP. */
function userOrIpKey(req) {
  if (req.user?._id) return `u:${req.user._id}`;
  return `ip:${ipKeyGenerator(req.ip)}`;
}

/** Whole API. High enough that no chat session ever notices it. */
export const apiLimiter = rateLimit({
  ...standardOptions(5 * M, 900),
  keyGenerator: (req) => userOrIpKey(req),
  skip: (req) => {
    // Liveness probes and third-party webhook traffic must never be throttled.
    if (req.path === "/health") return true;
    if (req.path.startsWith("/api/webhooks")) return true;
    return false;
  },
});

/** Media + voice-note uploads: the expensive path (RAM/bandwidth). */
export const uploadLimiter = rateLimit({
  ...standardOptions(10 * M, 60),
  keyGenerator: (req) => userOrIpKey(req),
});

/** Invite redemption: the only endpoint where guessing matters. */
export const redeemLimiter = rateLimit({
  ...standardOptions(10 * M, 12),
  keyGenerator: (req) => ipKeyGenerator(req.ip),
});

/** Profile/settings edits and other user-driven writes. */
export const writeLimiter = rateLimit({
  ...standardOptions(M, 120),
  keyGenerator: (req) => userOrIpKey(req),
});

/** Password endpoints: deny brute-force guessing of credentials. */
export const authLimiter = rateLimit({
  ...standardOptions(15 * M, 20),
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip)}`,
});
