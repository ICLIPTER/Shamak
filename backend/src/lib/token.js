import jwt from "jsonwebtoken";
import crypto from "node:crypto";

/**
 * Self-hosted token issuance: short-lived access token (sent as
 * `Authorization: Bearer`), long-lived refresh token (HttpOnly cookie).
 * Secrets fall back to development constants so local dev runs without
 * extra configuration; production requires real secrets.
 */

const ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "shamak-dev-access-secret-change-me";
const REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "shamak-dev-refresh-secret-change-me";

const ACCESS_TTL_WORDS = { expiresIn: "15m" };
const REFRESH_TTL_WORDS = { expiresIn: "30d" };

export const ACCESS_COOKIE_NAME = "shamak_refresh";

export function requireTokenSecretsInProd() {
  const missing = [
    process.env.JWT_ACCESS_SECRET ? null : "JWT_ACCESS_SECRET",
    process.env.JWT_REFRESH_SECRET ? null : "JWT_REFRESH_SECRET",
  ].filter(Boolean);
  return missing;
}

export function signAccessToken(userId) {
  return jwt.sign({ sub: String(userId) }, ACCESS_SECRET, ACCESS_TTL_WORDS);
}

export function signRefreshToken(userId) {
  return jwt.sign(
    { sub: String(userId), jti: crypto.randomBytes(12).toString("hex") },
    REFRESH_SECRET,
    REFRESH_TTL_WORDS,
  );
}

/**
 * @returns {null | { userId: string }} the payload's user id, or null when
 * invalid/expired.
 */
export function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, ACCESS_SECRET);
    return payload?.sub ? { userId: payload.sub } : null;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token) {
  try {
    const payload = jwt.verify(token, REFRESH_SECRET);
    return payload?.sub ? { userId: payload.sub } : null;
  } catch {
    return null;
  }
}

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax", // localhost ports share the same site in dev; prod is same-origin
  path: "/api/auth", // only ever sent to auth endpoints
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

export function refreshCookieOptions(isProduction) {
  return { ...REFRESH_COOKIE_OPTIONS, secure: Boolean(isProduction) };
}
