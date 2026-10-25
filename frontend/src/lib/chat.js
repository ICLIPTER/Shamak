// Small, dependency-free helpers used across the chat UI.

export function getInitials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function isGroup(conversation) {
  return conversation?.type === "group";
}

export function conversationTitle(conversation) {
  if (!conversation) return "";
  if (isGroup(conversation)) return conversation.name || "Family group";
  return conversation.peer?.fullName || conversation.name || "Direct chat";
}

export function conversationAvatar(conversation) {
  if (!conversation) return "";
  if (isGroup(conversation)) return conversation.avatar || "";
  return conversation.peer?.profilePic || "";
}

export function formatMessageTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

/** "Today", "Yesterday", "Monday", "Oct 6, 2025" */
export function formatDayLabel(value) {
  const date = new Date(value);
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const diffDays = Math.round((today - target) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: "long" });

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

/** Short stamp for the conversation list: "9:41 PM", "Yesterday", "Mon". */
export function formatConversationTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const diffDays = Math.round((today - target) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return formatMessageTime(date);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: "short" });

  return date.toLocaleDateString([], { month: "numeric", day: "numeric" });
}

export function formatDaysUntil(days) {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `In ${days} days`;
  if (days < 30) return `In ${Math.round(days / 7)} weeks`;
  return `In ${Math.round(days / 30)} months`;
}

export function messagePreview(message) {
  if (!message) return "";
  if (message.kind === "system") return message.text || "";
  if (message.kind === "image") return "📷 Photo";
  if (message.kind === "video") return "🎥 Video";
  if (message.kind === "audio") return "🎙️ Voice message";
  if (message.kind === "poll") return `📊 ${message.text || "Poll"}`;
  return message.text || "";
}

export function messageKind(message) {
  if (!message) return "text";
  if (message.poll) return "poll";
  if (message.image) return "image";
  if (message.video) return "video";
  if (message.audio) return "audio";
  if (message.system) return "system";
  return "text";
}

export function formatDuration(seconds = 0) {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/** Sorted "idA:idB" key — mirrors the backend's direct-chat uniqueness rule. */
export function directKey(a, b) {
  return [String(a), String(b)].sort().join(":");
}

export function summarizeReactions(reactions = [], meId) {
  const map = new Map();

  for (const reaction of reactions) {
    const entry = map.get(reaction.emoji) || { emoji: reaction.emoji, count: 0, mine: false };
    entry.count += 1;
    if (String(reaction.userId) === String(meId)) entry.mine = true;
    map.set(reaction.emoji, entry);
  }

  return [...map.values()];
}

export const QUICK_REACTIONS = ["❤️", "😂", "👍", "😮", "😢", "🙏"];
