import PushSubscription from "../models/pushSubscription.model.js";
import { getVapidPublicKey, hasPushConfig, sendPushToUser } from "../lib/push.js";

export function getPublicKey(req, res) {
  if (!hasPushConfig()) {
    res.status(200).json({ enabled: false, publicKey: "" });
    return;
  }

  res.status(200).json({ enabled: true, publicKey: getVapidPublicKey() });
}

export async function subscribe(req, res) {
  try {
    const { endpoint, keys } = req.body?.subscription || req.body || {};

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ message: "Invalid push subscription" });
      return;
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        $set: {
          userId: req.user._id,
          endpoint,
          keys: { p256dh: keys.p256dh, auth: keys.auth },
          userAgent: req.headers["user-agent"] || "",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.status(201).json({ ok: true });
  } catch (error) {
    console.error("Error in subscribe:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function unsubscribe(req, res) {
  try {
    const { endpoint } = req.body || {};

    if (endpoint) {
      await PushSubscription.deleteOne({ endpoint, userId: req.user._id });
    } else {
      await PushSubscription.deleteMany({ userId: req.user._id });
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error in unsubscribe:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

/** Send a test notification to the current user's devices. */
export async function testPush(req, res) {
  try {
    await sendPushToUser(req.user._id, {
      title: "Shamak notifications are on",
      body: "You'll get a ping here when the family posts.",
      url: "/",
    });

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error in testPush:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}
