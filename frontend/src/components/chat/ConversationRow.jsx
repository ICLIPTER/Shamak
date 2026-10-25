import { Avatar } from "@heroui/react";
import { BellOffIcon, UsersIcon } from "lucide-react";

import {
  conversationAvatar,
  conversationTitle,
  formatConversationTime,
  getInitials,
  isGroup,
  messagePreview,
} from "../../lib/chat";
import { AvatarWithOnlineIndicator } from "./AvatarWithOnlineIndicator";

export function ConversationRow({
  conversation,
  selected,
  isOnline = false,
  typingLabel = "",
  onSelect,
}) {
  const title = conversationTitle(conversation);
  const group = isGroup(conversation);
  const unread = conversation.unreadCount || 0;
  const preview = typingLabel || messagePreview(conversation.lastMessage);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition-colors ${
        selected ? "bg-accent-soft" : "hover:bg-surface/60"
      }`}
    >
      {group ? (
        <Avatar className="size-12 shrink-0">
          <Avatar.Image alt={title} src={conversationAvatar(conversation)} />
          <Avatar.Fallback className="text-sm font-medium">
            {getInitials(title) || <UsersIcon className="size-5" />}
          </Avatar.Fallback>
        </Avatar>
      ) : (
        <AvatarWithOnlineIndicator isOnline={isOnline}>
          <Avatar className="size-12 shrink-0">
            <Avatar.Image alt={title} src={conversationAvatar(conversation)} />
            <Avatar.Fallback className="text-sm font-medium">
              {getInitials(title)}
            </Avatar.Fallback>
          </Avatar>
        </AvatarWithOnlineIndicator>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="truncate text-[15px] font-semibold">{title}</p>
          {group ? (
            <span className="shrink-0 text-[11px] text-muted">
              {conversation.memberCount}
            </span>
          ) : null}
          <span className="ml-auto shrink-0 text-[11px] text-muted">
            {formatConversationTime(conversation.lastMessageAt)}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-1.5">
          {typingLabel ? (
            <p className="truncate text-[13px] text-accent">{typingLabel}</p>
          ) : (
            <p className="truncate text-[13px] text-muted">{preview}</p>
          )}

          {conversation.muted ? (
            <BellOffIcon className="size-3.5 shrink-0 text-muted" aria-hidden />
          ) : null}

          {unread > 0 ? (
            <span className="ml-auto flex min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-accent-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
