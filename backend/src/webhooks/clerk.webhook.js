import express from "express";
import User from "../models/user.model.js";
import Invite from "../models/invite.model.js";
import { verifyWebhook } from "@clerk/backend/webhooks";
import { invalidateUserCache } from "../middleware/auth.middleware.js";
import { emitToUser } from "../lib/socket.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    if (!signingSecret) {
      res.status(503).json({ message: "Webhook secret is not provided" });
      return;
    }

    // clerk's verifier expects a Web Request with the raw body; express.raw gives a Buffer.
    const payload = Buffer.isBuffer(req.body)
      ? req.body.toString("utf8")
      : String(req.body);
    const request = new Request("http://internal/webhooks/clerk", {
      method: "POST",
      headers: new Headers(req.headers),
      body: payload,
    });

    // throws if the signature is wrong or the body was tampered with; only then do we trust evt.
    const evt = await verifyWebhook(request, { signingSecret });

    if (evt.type === "user.created" || evt.type === "user.updated") {
      const u = evt.data;

      const email =
        u.email_addresses?.find((e) => e.id === u.primary_email_address_id)
          ?.email_address ??
        u.email_addresses?.[0]?.email_address ??
        "";

      const fullName =
        [u.first_name, u.last_name].filter(Boolean).join(" ") ||
        u.username ||
        email.split("@")[0];

      if (evt.type === "user.created") {
        // Bootstrap: the very first person to sign up becomes the family admin
        // and is approved automatically. Everyone after that needs approval or
        // a valid invite for their email address.
        const approvedCount = await User.countDocuments({
          isApproved: { $ne: false },
        });
        const isFirstUser = approvedCount === 0;

        const invite = email
          ? await Invite.findOne({
              email: email.toLowerCase(),
              usedBy: null,
              expiresAt: { $gt: new Date() },
            })
          : null;

        // Idempotent: Clerk can redeliver the same event.
        const user = await User.findOneAndUpdate(
          { clerkId: u.id },
          {
            $setOnInsert: {
              clerkId: u.id,
              email,
              fullName,
              profilePic: u.image_url,
              isApproved: isFirstUser || Boolean(invite),
              role: isFirstUser || invite?.role === "admin" ? "admin" : "member",
            },
          },
          { new: true, upsert: true, setDefaultsOnInsert: true },
        );

        if (invite && user) {
          emitToUser(invite.createdBy, "invite:changed", { ok: true });
          // Consumed codes must not linger on the admin screen.
          invite.usedBy = user._id;
          invite.usedAt = new Date();
          await invite.save();
          await Invite.deleteOne({ _id: invite._id }).catch(() => {});
        }
      } else {
        // Never clobber approval/role on an update.
        await User.updateOne(
          { clerkId: u.id },
          {
            $set: { email, fullName, profilePic: u.image_url },
            $setOnInsert: { clerkId: u.id },
          },
          { upsert: true },
        );
      }

      invalidateUserCache(u.id);
    }

    if (evt.type === "user.deleted") {
      if (evt.data.id) {
        await User.findOneAndDelete({ clerkId: evt.data.id });
        invalidateUserCache(evt.data.id);
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Error in Clerk webhook:", error);
    res.status(400).json({ message: "Webhook verification failed" });
  }
});

export default router;
