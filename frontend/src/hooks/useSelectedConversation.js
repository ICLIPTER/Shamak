import { useMediaQuery } from "./useMediaQuery";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";

export { getInitials } from "../lib/chat";

export function useSelectedConversation() {
  const activeConversationId = useChatStore(
    (state) => state.activeConversationId,
  );
  const conversations = useChatStore((state) => state.conversations);
  const typingByConversation = useChatStore(
    (state) => state.typingByConversation,
  );

  const authUser = useAuthStore((state) => state.authUser);
  const onlineUsers = useAuthStore((state) => state.onlineUsers);

  const isLargeScreen = useMediaQuery("(min-width: 1024px)");
  const isMobile = useMediaQuery("(max-width: 767px)");

  const activeConversation =
    conversations.find(
      (conversation) => conversation._id === activeConversationId,
    ) || null;

  const typingUsers = (typingByConversation[activeConversationId] || []).filter(
    (entry) => entry.userId !== authUser?._id,
  );

  const peerOnline = activeConversation
    ? activeConversation.type === "direct"
      ? onlineUsers.includes(activeConversation.peer?._id)
      : (activeConversation.members || []).some((member) =>
          onlineUsers.includes(member._id),
        )
    : false;

  const onlineMemberCount = activeConversation
    ? (activeConversation.members || []).filter((member) =>
        onlineUsers.includes(member._id),
      ).length
    : 0;

  return {
    activeConversation,
    activeConversationId,
    isLargeScreen,
    isMobile,
    typingUsers,
    peerOnline,
    onlineMemberCount,
  };
}
