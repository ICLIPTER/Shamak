import { useState } from "react";
import { Avatar, Button } from "@heroui/react";
import {
  BellIcon,
  BellOffIcon,
  ChevronLeftIcon,
  InfoIcon,
  PinIcon,
  SearchIcon,
  Trash2Icon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from "lucide-react";

import { AppLogo } from "../AppLogo";
import { AvatarWithOnlineIndicator } from "./AvatarWithOnlineIndicator";
import { ThemePresetPicker } from "../ThemePresetPicker";
import { ThemeToggle } from "../ThemeToggle";
import { WallpaperPicker } from "../WallpaperPicker";

import { useChatStore } from "../../store/useChatStore";
import { useSelectedConversation } from "../../hooks/useSelectedConversation";
import {
  conversationAvatar,
  conversationTitle,
  getInitials,
  isGroup,
} from "../../lib/chat";
import { axiosInstance } from "../../lib/axios";
import toast from "react-hot-toast";

export function ChatHeader({ onOpenGroupInfo, onOpenSearch, onOpenPinned }) {
  const isSoundEnabled = useChatStore((state) => state.isSoundEnabled);
  const setSoundEnabled = useChatStore((state) => state.setSoundEnabled);
  const setActiveConversationId = useChatStore(
    (state) => state.setActiveConversationId,
  );
  const getConversations = useChatStore((state) => state.getConversations);

  const {
    activeConversation,
    isLargeScreen,
    typingUsers,
    peerOnline,
    onlineMemberCount,
  } = useSelectedConversation();

  const title = conversationTitle(activeConversation);
  const group = isGroup(activeConversation);

  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleMute = async () => {
    if (!activeConversation) return;
    try {
      await axiosInstance.post(
        `/conversations/${activeConversation._id}/mute`,
        { muted: !activeConversation.muted },
      );
      getConversations({ silent: true });
      toast.success(activeConversation.muted ? "Unmuted" : "Muted");
    } catch {
      toast.error("Could not update notifications");
    }
  };

  /** Deletes the whole conversation + its history for EVERY member. */
  const deleteChat = async () => {
    if (!activeConversation) return;
    try {
      await axiosInstance.delete(`/conversations/${activeConversation._id}`);
      toast.success("Chat deleted");
      // The conversation:removed socket event drops it from everyone's
      // sidebar, including ours.
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Could not delete this chat",
      );
    } finally {
      setConfirmDelete(false);
    }
  };

  const subtitle = typingUsers.length
    ? group
      ? `${typingUsers[0].name} is typing…`
      : "typing…"
    : group
      ? `${onlineMemberCount} online · ${activeConversation?.memberCount || 0} members`
      : peerOnline
        ? "Online"
        : "Offline";

  return (
    <header className="sticky top-0 z-10 flex shrink-0 items-center gap-1 border-b border-border px-1.5 py-1.5 sm:gap-2 sm:px-2 sm:py-2">
      {activeConversation && !isLargeScreen ? (
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          className="shrink-0"
          onPress={() => setActiveConversationId(null)}
        >
          <ChevronLeftIcon className="size-6" strokeWidth={2.25} />
        </Button>
      ) : null}

      {activeConversation ? (
        <>
          <button
            type="button"
            onClick={onOpenGroupInfo}
            className="flex min-w-0 items-center gap-2 rounded-xl px-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {group ? (
              <Avatar className="size-9 shrink-0">
                <Avatar.Image alt={title} src={conversationAvatar(activeConversation)} />
                <Avatar.Fallback className="text-sm font-medium">
                  {getInitials(title)}
                </Avatar.Fallback>
              </Avatar>
            ) : (
              <AvatarWithOnlineIndicator isOnline={peerOnline}>
                <Avatar className="size-9 shrink-0">
                  <Avatar.Image alt={title} src={conversationAvatar(activeConversation)} />
                  <Avatar.Fallback className="text-sm font-medium">
                    {getInitials(title)}
                  </Avatar.Fallback>
                </Avatar>
              </AvatarWithOnlineIndicator>
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold leading-tight">
                {title}
              </p>
              <p
                className={`truncate text-xs ${
                  typingUsers.length ? "text-accent" : "text-muted"
                }`}
              >
                {typingUsers.length ? (
                  subtitle
                ) : !group && peerOnline ? (
                  <span className="font-medium text-success">Online</span>
                ) : (
                  subtitle
                )}
              </p>
            </div>
          </button>
        </>
      ) : (
        <div className="flex flex-1 items-center gap-2.5">
          <AppLogo size={36} className="rounded-[9px]" />
          <div className="flex-1">
            <p className="truncate text-[13px] font-medium text-muted">
              Select a conversation
            </p>
          </div>
        </div>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
        {activeConversation ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              className="hidden sm:flex"
              aria-label="Search messages"
              onPress={onOpenSearch}
            >
              <SearchIcon className="size-5" strokeWidth={2} aria-hidden />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              className="hidden sm:flex"
              aria-label="Pinned messages"
              onPress={onOpenPinned}
            >
              <PinIcon className="size-5" strokeWidth={2} aria-hidden />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              className="hidden sm:flex"
              aria-label={activeConversation.muted ? "Unmute" : "Mute"}
              onPress={toggleMute}
            >
              {activeConversation.muted ? (
                <BellOffIcon className="size-5" strokeWidth={2} aria-hidden />
              ) : (
                <BellIcon className="size-5" strokeWidth={2} aria-hidden />
              )}
            </Button>

            {confirmDelete ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                aria-label="Confirm chat deletion"
                onPress={deleteChat}
              >
                Delete?
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                isIconOnly
                className="hidden sm:flex"
                aria-label="Delete chat"
                onPress={() => {
                  setConfirmDelete(true);
                  // Disarm automatically if they walk away.
                  setTimeout(() => setConfirmDelete(false), 4000);
                }}
              >
                <Trash2Icon className="size-5" strokeWidth={2} aria-hidden />
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              className="hidden sm:flex"
              aria-label="Chat details"
              onPress={onOpenGroupInfo}
            >
              <InfoIcon className="size-5" strokeWidth={2} aria-hidden />
            </Button>
          </>
        ) : null}

        <div className="hidden min-[420px]:contents">
          <WallpaperPicker />
          <ThemePresetPicker />
        </div>

        <ThemeToggle />

        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          className="shrink-0"
          aria-pressed={isSoundEnabled}
          aria-label={isSoundEnabled ? "Mute sounds" : "Enable sounds"}
          onPress={() => setSoundEnabled(!isSoundEnabled)}
        >
          {isSoundEnabled ? (
            <Volume2Icon className="size-5.5" strokeWidth={2} aria-hidden />
          ) : (
            <VolumeXIcon className="size-5.5" strokeWidth={2} aria-hidden />
          )}
        </Button>

        {activeConversation ? (
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            className="shrink-0"
            aria-label="Close chat"
            onPress={() => setActiveConversationId(null)}
          >
            <XIcon className="size-5.5" strokeWidth={2} aria-hidden />
          </Button>
        ) : null}
      </div>
    </header>
  );
}
