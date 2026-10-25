import webpush from "web-push";

import PushSubscription from "../models/pushSubscription.model.js";

let configured = false;

function configure() {
  if (configured) return true;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:family@shamak.app",
    publicKey,
    privateKey,
  );

  configured = true;
  return true;
}

export function hasPushConfig() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || "";
}

/**
 * Send a push notification to every device a user has registered.
 * Dead subscriptions (404/410) are pruned so the table stays clean.
 */
export async function sendPushToUser(userId, payload) {
  if (!configure()) return;

  const subscriptions = await PushSubscription.find({ userId });

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys,
          },
          JSON.stringify(payload),
        );
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: subscription._id });
        } else {
          console.error("Push send failed:", error.message);
        }
      }
    }),
  );
}

/**
 * Notify every conversation member except the sender.
 * Muted conversations are skipped.
 */
export async function notifyConversation(conversation, senderId, payload) {
  if (!hasPushConfig()) return;

  const members = conversation.members
    .map(String)
    .filter((id) => id !== String(senderId));

  const mutedIds = new Set(
    (conversation.reads || [])
      .filter((read) => read.muted)
      .map((read) => String(read.userId)),
  );

  await Promise.all(
    members
      .filter((id) => !mutedIds.has(id))
      .map((userId) => sendPushToUser(userId, payload)),
  );
}

/** Convenience: build a notification payload from a message. */
export function buildMessagePayload({ conversation, message, senderName }) {
  let body = message.text?.trim() || "";

  if (!body) {
    if (message.image) body = "📷 Photo";
    else if (message.video) body = "🎥 Video";
    else if (message.audio) body = "🎙️ Voice message";
    else if (message.poll) body = `📊 ${message.poll.question}`;
    else body = "New message";
  }

  const title =
    conversation.type === "group"
      ? `${conversation.name || "Family"} · ${senderName}`
      : senderName;

  return {
    title,
    body: body.length > 140 ? `${body.slice(0, 137)}…` : body,
    conversationId: String(conversation._id),
    tag: `conv-${String(conversation._id)}`,
    url: `/?c=${String(conversation._id)}`,
  };
}

/** Used by the birthday cron to fan out a reminder to the whole family. */
export async function broadcastPushToAll(userIds, payload) {
  await Promise.all(userIds.map((id) => sendPushToUser(id, payload)));
}

export default webpush;
