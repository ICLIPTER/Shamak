/**
 * Set a password for an existing account directly in the database.
 *
 * The web admin "Reset password" button needs a logged-in admin — this
 * script exists for the one time that doesn't work (the admin's own account
 * predates passwords). Run from backend/:
 *
 *   node scripts/set-password.js you@example.com
 *   node scripts/set-password.js you@example.com mypassword123
 */
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import User from "../src/models/user.model.js";

const [email, provided] = process.argv.slice(2);

if (!email) {
  console.error("Usage: node scripts/set-password.js <email> [new-password]");
  process.exit(1);
}

const password = provided || crypto.randomBytes(4).toString("hex").toUpperCase();

await mongoose.connect(process.env.MONGO_URI);

const user = await User.findOneAndUpdate(
  { email: email.toLowerCase().trim() },
  { $set: { passwordHash: await bcrypt.hash(password, 10) } },
  { new: true },
).select("email fullName");

if (!user) {
  console.error(`No account found for ${email}`);
  process.exit(1);
}

console.log(`Password set for ${user.fullName} <${user.email}>`);
console.log(`Password: ${password}`);
await mongoose.disconnect();
process.exit(0);
