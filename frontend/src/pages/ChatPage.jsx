import { Suspense, lazy, useEffect } from "react";
import { useSearchParams } from "react-router";
import { useOverlayState } from "@heroui/react";

import { useWallpaper } from "../context/wallpaper";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { useSelectedConversation } from "../hooks/useSelectedConversation";
import { ChatSidebar } from "../components/chat/ChatSidebar";
import { ChatHeader } from "../components/chat/ChatHeader";
import { MessageList } from "../components/chat/MessageList";
import { ChatComposer } from "../components/chat/ChatComposer";
import PageLoader from "../components/PageLoader";

// Panels that aren't needed on first paint are loaded on demand.
const NewChatModal = lazy(() =>
  import("../components/chat/NewChatModal").then((module) => ({
    default: module.NewChatModal,
  })),
);
const GroupInfoModal = lazy(() =>
  import("../components/chat/GroupInfoModal").then((module) => ({
    default: module.GroupInfoModal,
  })),
);
const PinnedMessagesModal = lazy(() =>
  import("../components/chat/PinnedMessagesModal").then((module) => ({
    default: module.PinnedMessagesModal,
  })),
);
const MessageSearchModal = lazy(() =>
  import("../components/chat/MessageSearchModal").then((module) => ({
    default: module.MessageSearchModal,
  })),
);
const FamilyHub = lazy(() =>
  import("../components/family/FamilyHub").then((module) => ({
    default: module.FamilyHub,
  })),
);
const ProfileModal = lazy(() =>
  import("../components/ProfileModal").then((module) => ({
    default: module.ProfileModal,
  })),
);

export default function ChatPage() {
  const { frameStyle } = useWallpaper();
  const [searchParams, setSearchParams] = useSearchParams();

  const getConversations = useChatStore((state) => state.getConversations);
  const getMessages = useChatStore((state) => state.getMessages);
  const getUsers = useChatStore((state) => state.getUsers);
  const subscribeToEvents = useChatStore((state) => state.subscribeToEvents);
  const unsubscribeFromEvents = useChatStore(
    (state) => state.unsubscribeFromEvents,
  );
  const setActiveConversationId = useChatStore(
    (state) => state.setActiveConversationId,
  );

  const socket = useAuthStore((state) => state.socket);
  const { activeConversation, activeConversationId } =
    useSelectedConversation();

  const newChatModal = useOverlayState();
  const familyModal = useOverlayState();
  const profileModal = useOverlayState();
  const groupInfoModal = useOverlayState();
  const searchModal = useOverlayState();
  const pinnedModal = useOverlayState();

  // Initial data
  useEffect(() => {
    getUsers();
    getConversations();
  }, [getConversations, getUsers]);

  // Realtime listeners (re-attach whenever the socket reconnects)
  useEffect(() => {
    if (!socket) return undefined;
    subscribeToEvents();
    return () => unsubscribeFromEvents();
  }, [socket, subscribeToEvents, unsubscribeFromEvents]);

  // Load messages for the active conversation
  useEffect(() => {
    if (!activeConversationId) return;
    getMessages(activeConversationId);
  }, [activeConversationId, getMessages]);

  // Deep links from push notifications: /?c=<conversationId> or /?tab=family
  useEffect(() => {
    const conversationId = searchParams.get("c");
    const tab = searchParams.get("tab");
    if (!conversationId && !tab) return;

    if (conversationId) setActiveConversationId(conversationId);
    if (tab === "family") familyModal.open();

    const next = new URLSearchParams(searchParams);
    next.delete("c");
    next.delete("tab");
    setSearchParams(next, { replace: true });
  }, [searchParams, setActiveConversationId, setSearchParams, familyModal]);

  // When the window regains focus, clear the unread badge for the open chat.
  useEffect(() => {
    const onFocus = () => {
      if (activeConversationId) {
        useChatStore.getState().markRead(activeConversationId);
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [activeConversationId]);

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden p-2 sm:p-3 md:p-8"
      style={frameStyle}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-1 overflow-hidden rounded-2xl border border-border bg-background text-foreground">
        <ChatSidebar
          onOpenFamily={familyModal.open}
          onOpenNewChat={newChatModal.open}
          onOpenProfile={profileModal.open}
        />

        <div
          className={`flex-1 flex-col overflow-hidden ${
            !activeConversationId ? "hidden lg:flex" : "flex"
          }`}
        >
          <ChatHeader
            onOpenGroupInfo={groupInfoModal.open}
            onOpenSearch={searchModal.open}
            onOpenPinned={pinnedModal.open}
          />
          <MessageList />
          {activeConversation ? <ChatComposer /> : null}
        </div>
      </div>

      <Suspense fallback={<PageLoader />}>
        {newChatModal.isOpen ? <NewChatModal state={newChatModal} /> : null}
        {familyModal.isOpen ? <FamilyHub state={familyModal} /> : null}
        {profileModal.isOpen ? <ProfileModal state={profileModal} /> : null}
        {groupInfoModal.isOpen ? (
          <GroupInfoModal
            state={groupInfoModal}
            conversation={activeConversation}
            onLeft={() => setActiveConversationId(null)}
          />
        ) : null}
        {searchModal.isOpen ? (
          <MessageSearchModal
            state={searchModal}
            conversationId={activeConversationId}
          />
        ) : null}
        {pinnedModal.isOpen ? (
          <PinnedMessagesModal
            state={pinnedModal}
            conversationId={activeConversationId}
          />
        ) : null}
      </Suspense>
    </div>
  );
}
