import Event from "../models/event.model.js";
import User from "../models/user.model.js";

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Keep calendar dates at UTC noon so timezones never shift the day. */
function normalizeCalendarDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12),
  );
}

/** Next occurrence of a month/day pair, this year or next. */
function nextOccurrence(date, today) {
  const month = date.getMonth();
  const day = date.getDate();
  let next = new Date(today.getFullYear(), month, day);
  if (next < today) next = new Date(today.getFullYear() + 1, month, day);
  return next;
}

function daysUntil(target, today) {
  const MS = 1000 * 60 * 60 * 24;
  return Math.round((startOfDay(target) - startOfDay(today)) / MS);
}

/**
 * Birthdays live on the user document, everything else in the Event
 * collection. The client gets one merged, sorted list.
 */
export async function listUpcoming(req, res) {
  try {
    const today = startOfDay(new Date());
    const windowDays = Math.min(
      Math.max(Number.parseInt(req.query.days, 10) || 365, 1),
      365,
    );
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + windowDays);

    const [users, events] = await Promise.all([
      User.find({
        isApproved: { $ne: false },
        birthday: { $ne: null },
      })
        .select("fullName profilePic birthday relation")
        .lean(),

      Event.find({
        $or: [
          { yearly: true },
          { date: { $gte: today, $lte: horizon } },
        ],
      })
        .populate("memberId", "fullName profilePic")
        .lean(),
    ]);

    const birthdays = users.map((user) => {
      const occurrence = nextOccurrence(new Date(user.birthday), today);
      return {
        _id: `birthday-${user._id}`,
        type: "birthday",
        title: `${user.fullName}'s birthday`,
        description: user.relation ? `${user.relation}` : "",
        date: occurrence,
        yearly: true,
        allDay: true,
        daysUntil: daysUntil(occurrence, today),
        member: {
          _id: String(user._id),
          fullName: user.fullName,
          profilePic: user.profilePic,
        },
      };
    });

    const mappedEvents = events.map((event) => {
      const date = event.yearly
        ? nextOccurrence(new Date(event.date), today)
        : new Date(event.date);

      return {
        _id: String(event._id),
        type: event.type,
        title: event.title,
        description: event.description,
        date,
        yearly: event.yearly,
        allDay: event.allDay,
        daysUntil: daysUntil(date, today),
        member: event.memberId
          ? {
              _id: String(event.memberId._id),
              fullName: event.memberId.fullName,
              profilePic: event.memberId.profilePic,
            }
          : null,
      };
    });

    const all = [...birthdays, ...mappedEvents]
      .filter((item) => item.daysUntil >= 0 && item.daysUntil <= windowDays)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    res.status(200).json(all);
  } catch (error) {
    console.error("Error in listUpcoming:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function createEvent(req, res) {
  try {
    const { title, description, type, date, allDay, yearly, reminderDaysBefore } =
      req.body || {};

    const parsedDate = normalizeCalendarDate(date);
    if (!title || !parsedDate) {
      res.status(400).json({ message: "Title and a valid date are required" });
      return;
    }

    const event = await Event.create({
      title: String(title).slice(0, 120),
      description: String(description || "").slice(0, 500),
      type: ["birthday", "anniversary", "gathering", "reminder"].includes(type)
        ? type
        : "gathering",
      date: parsedDate,
      allDay: allDay !== false,
      yearly: Boolean(yearly),
      reminderDaysBefore: Number(reminderDaysBefore) || 1,
      createdBy: req.user._id,
    });

    res.status(201).json(event);
  } catch (error) {
    console.error("Error in createEvent:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateEvent(req, res) {
  try {
    const allowed = [
      "title",
      "description",
      "type",
      "date",
      "allDay",
      "yearly",
      "reminderDaysBefore",
    ];
    const updates = {};

    for (const key of allowed) {
      if (req.body?.[key] !== undefined) updates[key] = req.body[key];
    }

    if (updates.date) {
      const parsed = normalizeCalendarDate(updates.date);
      if (!parsed) {
        res.status(400).json({ message: "Invalid date" });
        return;
      }
      updates.date = parsed;
    }

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true },
    );

    if (!event) {
      res.status(404).json({ message: "Event not found" });
      return;
    }

    res.status(200).json(event);
  } catch (error) {
    console.error("Error in updateEvent:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function deleteEvent(req, res) {
  try {
    const event = await Event.findById(req.params.id).select("createdBy");

    if (!event) {
      res.status(404).json({ message: "Event not found" });
      return;
    }

    const canDelete =
      req.user.role === "admin" ||
      event.createdBy.equals(req.user._id);

    if (!canDelete) {
      res.status(403).json({ message: "You cannot delete this event" });
      return;
    }

    await Event.deleteOne({ _id: event._id });
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error in deleteEvent:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}
