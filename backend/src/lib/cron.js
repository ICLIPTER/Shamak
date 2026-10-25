import { CronJob } from "cron";
import http from "node:http";
import https from "node:https";

import User from "../models/user.model.js";
import Event from "../models/event.model.js";
import { broadcastPushToAll, hasPushConfig } from "./push.js";

function startOfDay(date) {
  // Calendar dates are stored at UTC noon; stay in UTC so the day never
  // shifts with the server timezone.
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function nextOccurrence(date, today) {
  const next = new Date(
    Date.UTC(today.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  if (next < today) next.setUTCFullYear(today.getUTCFullYear() + 1);
  return next;
}

function daysUntil(target, today) {
  const MS = 1000 * 60 * 60 * 24;
  return Math.round((startOfDay(target) - startOfDay(today)) / MS);
}

function prettyDate(date) {
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function reminderLabel(days) {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

/**
 * Once a day, tell the family about birthdays and saved events that are
 * coming up. Runs only in production.
 */
async function sendReminders() {
  if (!hasPushConfig()) return;

  const today = startOfDay(new Date());
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 31);

  const [members, events] = await Promise.all([
    User.find({ isApproved: { $ne: false } })
      .select("_id fullName birthday")
      .lean(),
    Event.find({
      $or: [
        { yearly: true },
        { date: { $gte: today, $lte: horizon } },
      ],
    })
      .select("title date reminderDaysBefore type yearly")
      .lean(),
  ]);

  const recipientIds = members.map((member) => member._id);

  const birthdayReminders = members
    .filter((member) => member.birthday)
    .map((member) => {
      const occurrence = nextOccurrence(new Date(member.birthday), today);
      return {
        days: daysUntil(occurrence, today),
        date: occurrence,
        title: `${member.fullName}'s birthday`,
      };
    })
    .filter((reminder) => reminder.days === 1 || reminder.days === 0);

  const eventReminders = events
    .map((event) => {
      const occurrence = event.yearly
        ? nextOccurrence(new Date(event.date), today)
        : startOfDay(new Date(event.date));
      return {
        days: daysUntil(occurrence, today),
        date: occurrence,
        title: event.title,
        before: event.reminderDaysBefore ?? 1,
      };
    })
    .filter(
      (reminder) =>
        reminder.days >= 0 && reminder.days === Math.max(reminder.before, 0),
    );

  const notifications = [...birthdayReminders, ...eventReminders].map(
    (reminder) => ({
      title: `${reminderLabel(reminder.days)}: ${reminder.title}`,
      body:
        reminder.days === 0
          ? `It's ${prettyDate(reminder.date)} — don't forget to say something.`
          : `Coming up on ${prettyDate(reminder.date)}.`,
      url: "/?tab=family",
      tag: `reminder-${reminder.title}`,
    }),
  );

  if (notifications.length === 0) return;

  // Send each notification once to the whole family.
  for (const notification of notifications) {
    await broadcastPushToAll(recipientIds, notification);
  }

  console.log(`Sent ${notifications.length} family reminders`);
}

const job = new CronJob("0 8 * * *", async function () {
  try {
    await sendReminders();
  } catch (error) {
    console.error("Reminder cron failed:", error.message);
  }
});

/**
 * A separate, lightweight keep-alive ping for free-tier hosts.
 * Every 14 minutes hits /health so the instance doesn't sleep.
 */
const keepAlive = new CronJob("*/14 * * * *", function () {
  const base = process.env.SELF_URL || process.env.FRONTEND_URL;
  if (!base) return;

  try {
    const url = new URL("/health", base).href;
    const client = url.startsWith("https:") ? https : http;

    client
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          console.log("Keep-alive failed", response.statusCode);
        }
        response.resume();
      })
      .on("error", () => {
        /* keep-alive is best-effort */
      });
  } catch {
    /* ignore malformed URLs */
  }
});

export default {
  start() {
    job.start();
    keepAlive.start();
  },
};
