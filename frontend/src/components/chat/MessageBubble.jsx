import { useState } from "react";
import {
  CheckCheckIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  CornerUpLeftIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  RotateCcwIcon,
  SmilePlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import toast from "react-hot-toast";

import { withTransform } from "../../lib/imageKit";
import {
  QUICK_REACTIONS,
  formatMessageTime,
  messageKind,
  summarizeReactions,
} from "../../lib/chat";
import { useAuthStore } from "../../store/useAuthStore";
import { useChatStore } from "../../store/useChatStore";
import { useClickOutside } from "../../hooks/useClickOutside";
import { MessageVideo } from "./MessageVideo";
import { AudioBubble } from "./AudioBubble";
import { PollBubble } from "./PollBubble";

const IMAGE_TRANSFORM = "q-auto,w-800,f-auto";

function ReadTicks({ message, isMine, otherCount }) {
  if (!isMine) return null;

  // Optimistic messages have no receipts yet.
  if (message.pending) {
    return (
      <ClockIcon
        className="size-3.5 opacity-70 animate-pulse"
        strokeWidth={2.5}
        aria-label="Sending"
      />
    );
  }

  const readCount = (message.readBy || []).filter(
    (receipt) => receipt.userId !== message.senderId,
  ).length;

  if (readCount >= Math.max(otherCount, 1)) {
    return (
      <CheckCheckIcon
        className="size-3.5 text-sky-300"
        strokeWidth={2.5}
        aria-label="Read"
      />
    );
  }

  if (readCount > 0) {
    return (
      <CheckCheckIcon
        className="size-3.5 opacity-70"
        strokeWidth={2.5}
        aria-label="Delivered"
      />
    );
  }

  return <CheckIcon className="size-3.5 opacity-60" strokeWidth={2.5} aria-label="Sent" />;
}

export function MessageBubble({ message, conversation, isMine, showSender }) {
  const meId = useAuthStore((state) => state.authUser?._id);
  const authUser = useAuthStore((state) => state.authUser);

  const setReplyTo = useChatStore((state) => state.setReplyTo);
  const startEditing = useChatStore((state) => state.startEditing);
  const reactToMessage = useChatStore((state) => state.reactToMessage);
  const deleteMessage = useChatStore((state) => state.deleteMessage);
  const pinMessage = useChatStore((state) => state.pinMessage);
  const retryMessage = useChatStore((state) => state.retryMessage);

  const [menuOpen, setMenuOpen] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const menuRef = useClickOutside(menuOpen, () => setMenuOpen(false));

  const kind = messageKind(message);
  const deleted = Boolean(message.deletedAt);
  const isLocal = Boolean(message.pending || message.failed);
  const reactions = summarizeReactions(message.reactions, meId);
  const isPinned = (conversation.pinnedMessages || []).includes(message._id);

  const otherCount = (conversation.members || []).length - 1;
  const canModerate =
    authUser?.role === "admin" ||
    (conversation.admins || []).includes(meId);

  if (message.system) {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full bg-surface px-3 py-1 text-center text-[11px] font-medium text-muted">
          {message.text}
        </span>
      </div>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.text || "");
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
    setMenuOpen(false);
  };

  return (
    <div
      id={`msg-${message._id}`}
      className={`group relative flex w-full gap-1.5 ${
        isMine ? "justify-end" : "justify-start"
      }`}
    >
      <div className={`flex max-w-[min(90%,30rem)] flex-col ${isMine ? "items-end" : "items-start"}`}>
        {showSender ? (
          <p className="mb-0.5 px-1 text-[11px] font-semibold text-accent">
            {message.sender?.fullName || "Member"}
          </p>
        ) : null}

        <div
          className={`relative rounded-2xl px-3 py-2 text-[15px] leading-snug sm:px-3.5 ${
            isMine
              ? "rounded-br-md bg-accent text-accent-foreground"
              : "rounded-bl-md bg-surface"
          } ${deleted || isLocal ? "italic opacity-70" : ""}`}
        >
          {isPinned ? (
            <PinIcon
              className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-background p-0.5 text-accent shadow"
              aria-label="Pinned"
            />
          ) : null}

          {message.replyTo && !deleted ? (
            <div
              className={`mb-1.5 rounded-lg border-l-2 px-2 py-1 text-[12px] ${
                isMine
                  ? "border-accent-foreground/60 bg-accent-foreground/12"
                  : "border-accent bg-background/60"
              }`}
            >
              <p className="font-semibold">{message.replyTo.senderName || "Reply"}</p>
              <p className="line-clamp-2 opacity-80">
                {message.replyTo.kind === "image"
                  ? "📷 Photo"
                  : message.replyTo.kind === "video"
                    ? "🎥 Video"
                    : message.replyTo.kind === "audio"
                      ? "🎙️ Voice message"
                      : message.replyTo.kind === "poll"
                        ? "📊 Poll"
                        : message.replyTo.text}
              </p>
            </div>
          ) : null}

          {deleted ? (
            <p className="flex items-center gap-1.5">
              <XIcon className="size-3.5" aria-hidden />
              This message was deleted
            </p>
          ) : (
            <>
              {kind === "image" ? (
                <button
                  type="button"
                  onClick={() => setLightbox(true)}
                  className="mb-1.5 block"
                >
                  <img
                    src={withTransform(message.image, IMAGE_TRANSFORM)}
                    alt="Shared"
                    loading="lazy"
                    decoding="async"
                    className="max-h-44 max-w-full rounded-lg object-cover sm:max-h-60 sm:rounded-xl"
                  />
                </button>
              ) : null}

              {kind === "video" ? <MessageVideo src={message.video} /> : null}

              {kind === "audio" ? (
                <AudioBubble src={message.audio} duration={message.audioDuration} isMine={isMine} />
              ) : null}

              {kind === "poll" ? <PollBubble message={message} isMine={isMine} /> : null}

              {message.text ? (
                <p className="whitespace-pre-wrap wrap-break-word">{message.text}</p>
              ) : null}
            </>
          )}

          <div
            className={`mt-1 flex items-center justify-end gap-1 text-[11px] tabular-nums ${
              isMine ? "text-accent-foreground/75" : "text-muted"
            }`}
          >
            {message.editedAt ? <span className="italic">edited</span> : null}
            <span>{formatMessageTime(message.createdAt)}</span>
            {message.failed ? (
              <button
                type="button"
                onClick={() => retryMessage(message.clientId)}
                className="flex items-center gap-0.5 rounded-full px-1 py-0.5 font-semibold text-danger hover:underline"
                aria-label="Retry sending"
              >
                <RotateCcwIcon className="size-3.5" strokeWidth={2.5} />
                Retry
              </button>
            ) : (
              <ReadTicks message={message} isMine={isMine} otherCount={otherCount} />
            )}
          </div>
        </div>

        {reactions.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                onClick={() => reactToMessage(message._id, reaction.emoji)}
                className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] ${
                  reaction.mine
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border bg-background text-muted"
                }`}
              >
                <span>{reaction.emoji}</span>
                <span className="tabular-nums">{reaction.count}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Hover actions */}
      <div
        className={`absolute top-0 z-10 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 ${
          isMine ? "right-full mr-1" : "left-full ml-1"
        } ${isLocal ? "!hidden" : ""}`}
      >
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="flex size-7 items-center justify-center rounded-full bg-background text-muted shadow-sm ring-1 ring-border hover:text-foreground"
          aria-label="Message actions"
        >
          <SmilePlusIcon className="size-4" />
        </button>

        <button
          type="button"
          onClick={() => setReplyTo(message)}
          className="hidden size-7 items-center justify-center rounded-full bg-background text-muted shadow-sm ring-1 ring-border hover:text-foreground sm:flex"
          aria-label="Reply"
        >
          <CornerUpLeftIcon className="size-4" />
        </button>

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="flex size-7 items-center justify-center rounded-full bg-background text-muted shadow-sm ring-1 ring-border hover:text-foreground"
          aria-label="More actions"
        >
          <MoreHorizontalIcon className="size-4" />
        </button>
      </div>

      {menuOpen ? (
        <div
          ref={menuRef}
          className={`absolute top-8 z-30 w-44 overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-xl ${
            isMine ? "right-0" : "left-0"
          }`}
        >
          <div className="flex justify-between gap-0.5 border-b border-border p-1.5">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  reactToMessage(message._id, emoji);
                  setMenuOpen(false);
                }}
                className="flex size-7 items-center justify-center rounded-full text-base hover:bg-surface"
                aria-label={`React ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setReplyTo(message);
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-surface"
          >
            <CornerUpLeftIcon className="size-4" /> Reply
          </button>

          {message.text ? (
            <button
              type="button"
              onClick={handleCopy}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-surface"
            >
              <CopyIcon className="size-4" /> Copy text
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => {
              pinMessage(message._id);
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-surface"
          >
            <PinIcon className="size-4" /> {isPinned ? "Unpin" : "Pin"}
          </button>

          {isMine && kind === "text" && !deleted ? (
            <button
              type="button"
              onClick={() => {
                startEditing(message);
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-surface"
            >
              <PencilIcon className="size-4" /> Edit
            </button>
          ) : null}

          {isMine || canModerate ? (
            <button
              type="button"
              onClick={() => {
                deleteMessage(message, { forEveryone: true });
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-danger hover:bg-surface"
            >
              <Trash2Icon className="size-4" /> Delete for everyone
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => {
              deleteMessage(message, { forEveryone: false });
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-[13px] text-danger hover:bg-surface"
          >
            <Trash2Icon className="size-4" /> Delete for me
          </button>
        </div>
      ) : null}

      {lightbox ? (
        <button
          type="button"
          onClick={() => setLightbox(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          aria-label="Close image"
        >
          <img
            src={message.image}
            alt="Shared"
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </button>
      ) : null}
    </div>
  );
}
