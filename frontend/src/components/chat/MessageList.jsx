import { useLayoutEffect, useRef } from "react";
import { LoaderIcon, MessageCircleIcon } from "lucide-react";

import { useChatStore } from "../../store/useChatStore";
import { useAuthStore } from "../../store/useAuthStore";
import { useSelectedConversation } from "../../hooks/useSelectedConversation";
import { formatDayLabel, isSameDay } from "../../lib/chat";
import { MessageBubble } from "./MessageBubble";
import { NoConversationPlaceholder } from "./NoConversationPlaceholder";
import { TypingIndicator } from "./TypingIndicator";

export function MessageList() {
  const messages = useChatStore((state) => state.messages);
  const isLoadingMessages = useChatStore((state) => state.isLoadingMessages);
  const isLoadingOlder = useChatStore((state) => state.isLoadingOlder);
  const hasMore = useChatStore((state) => state.hasMore);
  const getMessages = useChatStore((state) => state.getMessages);
  const authUser = useAuthStore((state) => state.authUser);

  const { activeConversation, activeConversationId, typingUsers } =
    useSelectedConversation();

  const scrollRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const preserveRef = useRef(false);
  const prevHeightRef = useRef(0);
  const prevTopRef = useRef(0);
  const switchRef = useRef(null);

  // New conversation → jump to the newest message.
  useLayoutEffect(() => {
    if (switchRef.current === activeConversationId) return;
    switchRef.current = activeConversationId;
    stickToBottomRef.current = true;
    const element = scrollRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
      requestAnimationFrame(() => {
        element.scrollTop = element.scrollHeight;
      });
    }
  }, [activeConversationId]);

  // Messages changed → either restore the reading position (older page) or
  // follow the conversation if the user was already at the bottom.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    if (preserveRef.current) {
      element.scrollTop =
        element.scrollHeight - prevHeightRef.current + prevTopRef.current;
      preserveRef.current = false;
      return;
    }

    if (stickToBottomRef.current) {
      element.scrollTop = element.scrollHeight;
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [messages.length, typingUsers.length]);

  const handleScroll = (event) => {
    const element = event.currentTarget;
    stickToBottomRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 140;

    if (
      element.scrollTop < 80 &&
      hasMore &&
      !isLoadingOlder &&
      activeConversationId
    ) {
      preserveRef.current = true;
      prevHeightRef.current = element.scrollHeight;
      prevTopRef.current = element.scrollTop;
      getMessages(activeConversationId, { older: true });
    }
  };

  if (!activeConversation) return <NoConversationPlaceholder />;

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex flex-1 flex-col overflow-y-auto overscroll-contain px-2 py-3 sm:px-3 sm:py-4"
    >
      {isLoadingOlder ? (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted">
          <LoaderIcon className="size-3.5 animate-spin" aria-hidden />
          Loading earlier messages
        </div>
      ) : hasMore ? (
        <button
          type="button"
          onClick={() => {
            preserveRef.current = true;
            prevHeightRef.current = scrollRef.current?.scrollHeight || 0;
            prevTopRef.current = scrollRef.current?.scrollTop || 0;
            getMessages(activeConversationId, { older: true });
          }}
          className="mx-auto mb-2 rounded-full bg-surface px-3 py-1 text-[12px] font-medium text-muted hover:text-foreground"
        >
          Load earlier messages
        </button>
      ) : null}

      {isLoadingMessages && messages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted">
          <LoaderIcon className="size-4 animate-spin" aria-hidden />
          Loading messages
        </div>
      ) : null}

      {!isLoadingMessages && messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-accent-soft">
            <MessageCircleIcon className="size-8 text-accent" strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-sm font-semibold">Say hello</p>
            <p className="mt-1 text-[13px] text-muted">
              This is the beginning of your conversation.
            </p>
          </div>
        </div>
      ) : null}

      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const showDay =
          !previous || !isSameDay(previous.createdAt, message.createdAt);

        return (
          <div key={message._id}>
            {showDay ? (
              <div className="my-3 flex justify-center">
                <span className="rounded-full bg-surface px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted">
                  {formatDayLabel(message.createdAt)}
                </span>
              </div>
            ) : null}

            <MessageBubble
              message={message}
              conversation={activeConversation}
              isMine={message.senderId === authUser?._id}
              showSender={
                activeConversation.type === "group" &&
                (!previous || previous.senderId !== message.senderId)
              }
            />
          </div>
        );
      })}

      <TypingIndicator />
    </div>
  );
}
