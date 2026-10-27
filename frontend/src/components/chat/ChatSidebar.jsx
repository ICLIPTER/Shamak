import { Avatar, Button, SearchField, Tabs } from "@heroui/react";
import {
  HomeIcon,
  MessageSquareIcon,
  PlusIcon,
  UserRoundPlusIcon,
  UsersIcon,
} from "lucide-react";

import { useAuthStore } from "../../store/useAuthStore";
import { useChatStore } from "../../store/useChatStore";
import { useSelectedConversation } from "../../hooks/useSelectedConversation";
import {
  conversationTitle,
  getInitials,
} from "../../lib/chat";
import { APP_NAME, AppLogo } from "../AppLogo";
import { ConversationRow } from "./ConversationRow";
import { AvatarWithOnlineIndicator } from "./AvatarWithOnlineIndicator";

function PersonRow({ user, isOnline, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-surface/60"
    >
      <AvatarWithOnlineIndicator isOnline={isOnline}>
        <Avatar className="size-12 shrink-0">
          <Avatar.Image alt={user.fullName} src={user.profilePic} />
          <Avatar.Fallback className="text-sm font-medium">
            {getInitials(user.fullName)}
          </Avatar.Fallback>
        </Avatar>
      </AvatarWithOnlineIndicator>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{user.fullName}</p>
        <p className="truncate text-[13px] text-muted">
          {user.relation || (isOnline ? "Online" : "Offline")}
        </p>
      </div>

      {user.role === "admin" ? (
        <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
          Admin
        </span>
      ) : null}
    </button>
  );
}

export function ChatSidebar({ onOpenFamily, onOpenNewChat, onOpenProfile }) {
  const conversations = useChatStore((state) => state.conversations);
  const users = useChatStore((state) => state.users);
  const searchQuery = useChatStore((state) => state.searchQuery);
  const setSearchQuery = useChatStore((state) => state.setSearchQuery);
  const sidebarTab = useChatStore((state) => state.sidebarTab);
  const setSidebarTab = useChatStore((state) => state.setSidebarTab);
  const setActiveConversationId = useChatStore(
    (state) => state.setActiveConversationId,
  );
  const openDirectChat = useChatStore((state) => state.openDirectChat);
  const typingByConversation = useChatStore(
    (state) => state.typingByConversation,
  );

  const authUser = useAuthStore((state) => state.authUser);
  const onlineUsers = useAuthStore((state) => state.onlineUsers);

  const { activeConversationId, isLargeScreen } = useSelectedConversation();

  const normalized = searchQuery.trim().toLowerCase();

  const filteredConversations = conversations.filter((conversation) =>
    conversationTitle(conversation).toLowerCase().includes(normalized),
  );

  const filteredUsers = users
    .filter((user) => user._id !== authUser?._id)
    .filter((user) => {
      if (!normalized) return true;
      return (
        user.fullName?.toLowerCase().includes(normalized) ||
        user.relation?.toLowerCase().includes(normalized) ||
        user.email?.toLowerCase().includes(normalized)
      );
    });

  const totalUnread = conversations.reduce(
    (sum, conversation) => sum + (conversation.unreadCount || 0),
    0,
  );

  return (
    <aside
      className={`w-full shrink-0 flex-col overflow-hidden border-r border-border lg:w-80 ${
        !isLargeScreen && activeConversationId ? "hidden lg:flex" : "flex"
      }`}
    >
      <div className="shrink-0 border-b border-border px-2 pb-2 pt-2.5 sm:px-3 sm:pt-3">
        <div className="flex items-center gap-2 px-0.5 sm:gap-2 sm:px-1">
          <AppLogo
            size={32}
            className="size-8 shrink-0 rounded-[9px]"
            alt=""
          />
          <p className="flex-1 truncate text-lg font-bold tracking-tight sm:text-[22px]">
            {APP_NAME}
            {totalUnread > 0 ? (
              <span className="ml-2 align-middle text-[11px] font-semibold text-accent">
                {totalUnread}
              </span>
            ) : null}
          </p>

          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            aria-label="Family hub"
            onPress={onOpenFamily}
          >
            <HomeIcon className="size-5" strokeWidth={2} />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            aria-label="New conversation"
            onPress={onOpenNewChat}
          >
            <PlusIcon className="size-5" strokeWidth={2} />
          </Button>

          <button
            type="button"
            onClick={onOpenProfile}
            className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Your profile"
          >
            <Avatar className="size-8">
              <Avatar.Image alt={authUser?.fullName || "You"} src={authUser?.profilePic} />
              <Avatar.Fallback className="text-[11px] font-medium">
                {getInitials(authUser?.fullName || "")}
              </Avatar.Fallback>
            </Avatar>
          </button>
        </div>
      </div>

      <Tabs
        selectedKey={sidebarTab}
        onSelectionChange={(key) => setSidebarTab(String(key))}
        variant="secondary"
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="shrink-0 border-b border-border px-3 pb-2 pt-2">
          <SearchField
            fullWidth
            variant="secondary"
            className="w-full"
            value={searchQuery}
            onChange={setSearchQuery}
          >
            <SearchField.Group className="rounded-xl">
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="Search family" aria-label="Search family" />
              {searchQuery ? <SearchField.ClearButton /> : null}
            </SearchField.Group>
          </SearchField>
        </div>

        <Tabs.ListContainer className="shrink-0 border-b border-border px-2 pb-2 pt-1">
          <Tabs.List className="w-full gap-0.5">
            <Tabs.Tab id="chats" className="flex-1 justify-center gap-1.5">
              <MessageSquareIcon className="size-3.5 opacity-80" aria-hidden />
              Chats
            </Tabs.Tab>
            <Tabs.Tab id="users" className="flex-1 justify-center gap-1.5">
              <UsersIcon className="size-3.5 opacity-80" aria-hidden />
              Family
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel
          id="chats"
          className="flex-1 overflow-x-hidden overflow-y-auto outline-none"
        >
          {filteredConversations.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm font-medium">No conversations yet</p>
              <p className="mt-1 text-[13px] text-muted">
                Start a chat with someone in your family.
              </p>
              <Button
                variant="primary"
                size="sm"
                className="mt-4"
                onPress={onOpenNewChat}
              >
                <PlusIcon className="size-4" />
                New chat
              </Button>
            </div>
          ) : (
            filteredConversations.map((conversation) => {
              const typingUsers = (
                typingByConversation[conversation._id] || []
              ).filter((entry) => entry.userId !== authUser?._id);

              const typingLabel =
                typingUsers.length > 0
                  ? conversation.type === "group"
                    ? `${typingUsers[0].name} is typing…`
                    : "typing…"
                  : "";

              return (
                <ConversationRow
                  key={conversation._id}
                  conversation={conversation}
                  selected={conversation._id === activeConversationId}
                  isOnline={onlineUsers.includes(conversation.peer?._id)}
                  typingLabel={typingLabel}
                  onSelect={() => setActiveConversationId(conversation._id)}
                />
              );
            })
          )}
        </Tabs.Panel>

        <Tabs.Panel
          id="users"
          className="flex-1 overflow-x-hidden overflow-y-auto outline-none"
        >
          {filteredUsers.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">
              No family members match your search.
            </p>
          ) : (
            filteredUsers.map((user) => (
              <PersonRow
                key={user._id}
                user={user}
                isOnline={onlineUsers.includes(user._id)}
                onSelect={() => openDirectChat(user._id)}
              />
            ))
          )}

          <button
            type="button"
            onClick={onOpenFamily}
            className="mt-2 flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-medium text-accent hover:bg-surface/60"
          >
            <UserRoundPlusIcon className="size-4" />
            Manage family & invites
          </button>
        </Tabs.Panel>
      </Tabs>
    </aside>
  );
}

export default ChatSidebar;
