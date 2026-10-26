import { create } from "zustand";
import { persist } from "zustand/middleware";
import toast from "react-hot-toast";

import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import { messageKind } from "../lib/chat";

function newClientId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Typing indicators clear themselves after a few seconds of silence.
const typingTimers = new Map();

// Delivery receipts are coalesced per conversation.
const deliveredTimers = new Map();

// Original payloads of optimistic messages, kept only in memory so a failed
// send can be retried (works even if the user navigates elsewhere first).
const pendingPayloads = new Map();

/** Chat-preview text for the sidebar ("📷 Photo", "📊 Did we go?" …). */
function previewText(message) {
  if (message.text) return message.text;
  const kind = messageKind(message);
  return kind === "image"
    ? "📷 Photo"
    : kind === "video"
      ? "🎥 Video"
      : kind === "audio"
        ? "🎙️ Voice message"
        : kind === "poll"
          ? `📊 ${message.poll?.question || "Poll"}`
          : "";
}

/** Free the local object URLs of a message we no longer render. */
function revokeMediaPreviews(message) {
  for (const key of ["image", "video", "audio"]) {
    if (typeof message?.[key] === "string" && message[key].startsWith("blob:")) {
      URL.revokeObjectURL(message[key]);
    }
  }
}

function buildOptimisticMessage({
  clientId,
  conversationId,
  me,
  text = "",
  file = null,
  audioBlob = null,
  audioDuration = 0,
  replyTo = null,
}) {
  const previewUrl =
    file || audioBlob ? URL.createObjectURL(file || audioBlob) : null;

  const optimistic = {
    _id: `local-${clientId}`,
    clientId,
    conversationId: String(conversationId),
    senderId: me._id,
    sender: { _id: me._id, fullName: me.fullName, profilePic: me.profilePic },
    text,
    replyTo: replyTo
      ? {
          messageId: replyTo._id,
          senderId: replyTo.senderId,
          senderName: replyTo.sender?.fullName || "",
          text: replyTo.text || "",
          kind: messageKind(replyTo),
        }
      : null,
    reactions: [],
    readBy: [],
    deliveredTo: [],
    editedAt: null,
    deletedAt: null,
    system: false,
    poll: null,
    pending: true,
    failed: false,
    createdAt: new Date().toISOString(),
    image: "",
    video: "",
    audio: "",
    audioDuration: 0,
  };

  if (file) {
    const type = file.type || "";
    if (type.startsWith("video/")) optimistic.video = previewUrl;
    else optimistic.image = previewUrl;
  } else if (audioBlob) {
    optimistic.audio = previewUrl;
    optimistic.audioDuration = audioDuration;
  }

  return optimistic;
}

function sortConversations(list) {
  return [...list].sort(
    (a, b) =>
      new Date(b.lastMessageAt || 0).getTime() -
      new Date(a.lastMessageAt || 0).getTime(),
  );
}

/** Merge two message lists by id, keeping chronological order. */
function mergeMessages(existing, incoming) {
  const byId = new Map(existing.map((message) => [message._id, message]));
  for (const message of incoming) byId.set(message._id, message);

  return [...byId.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export const useChatStore = create(
  persist(
    (set, get) => ({
      // ---- data -----------------------------------------------------------
      conversations: [],
      users: [],
      messages: [],
      activeConversationId: null,
      searchQuery: "",
      sidebarTab: "chats",

      // ---- composer / interaction ----------------------------------------
      composerText: "",
      replyTo: null,
      editingMessage: null,
      isSoundEnabled: true,
      isSendingMedia: false,
      // 0-100 while a media upload is in flight (images/video/voice).
      mediaUploadProgress: 0,
      isRecording: false,

      // ---- pagination / loading ------------------------------------------
      isLoadingConversations: false,
      isLoadingMessages: false,
      isLoadingOlder: false,
      hasMore: false,
      nextCursor: null,

      // ---- realtime -------------------------------------------------------
      typingByConversation: {},
      onlineUsers: [],

      // ---- search ---------------------------------------------------------
      isSearching: false,
      searchResults: [],

      // =====================================================================
      // Conversations
      // =====================================================================
      getUsers: async () => {
        try {
          const res = await axiosInstance.get("/users");
          set({ users: res.data });
        } catch (error) {
          console.error("Error loading family members:", error.message);
        }
      },

      getConversations: async ({ silent = false } = {}) => {
        if (!silent) set({ isLoadingConversations: true });
        try {
          const res = await axiosInstance.get("/conversations");
          set({ conversations: sortConversations(res.data) });
        } catch (error) {
          if (error.response?.status !== 403) {
            console.error("Error loading conversations:", error.message);
          }
        } finally {
          if (!silent) set({ isLoadingConversations: false });
        }
      },

      setActiveConversationId: (conversationId) => {
        const previous = get().activeConversationId;

        set({
          activeConversationId: conversationId,
          messages: String(previous) === String(conversationId) ? get().messages : [],
          replyTo: null,
          editingMessage: null,
          composerText: "",
          hasMore: false,
          nextCursor: null,
          searchResults: [],
        });

        if (conversationId) {
          get().markRead(conversationId);
          const socket = useAuthStore.getState().socket;
          socket?.emit("conversation:join", conversationId);
        }
      },

      createConversation: async ({ type = "direct", memberIds = [], name = "" }) => {
        try {
          const res = await axiosInstance.post("/conversations", {
            type,
            memberIds,
            name,
          });

          set((state) => {
            const exists = state.conversations.some(
              (conversation) => conversation._id === res.data._id,
            );
            return {
              conversations: sortConversations(
                exists
                  ? state.conversations.map((conversation) =>
                      conversation._id === res.data._id ? res.data : conversation,
                    )
                  : [res.data, ...state.conversations],
              ),
            };
          });

          get().setActiveConversationId(res.data._id);

          return res.data;
        } catch (error) {
          toast.error(
            error.response?.data?.message || "Could not start that conversation",
          );
          return null;
        }
      },

      openDirectChat: async (userId) => {
        const existing = get().conversations.find(
          (conversation) =>
            conversation.type === "direct" && conversation.peer?._id === userId,
        );

        if (existing) {
          get().setActiveConversationId(existing._id);
          return existing;
        }

        return get().createConversation({ type: "direct", memberIds: [userId] });
      },

      addConversation: (conversation) => {
        set((state) => {
          const exists = state.conversations.some(
            (item) => item._id === conversation._id,
          );
          const next = exists
            ? state.conversations.map((item) =>
                item._id === conversation._id ? conversation : item,
              )
            : [conversation, ...state.conversations];

          return { conversations: sortConversations(next) };
        });

        const socket = useAuthStore.getState().socket;
        if (conversation?._id) socket?.emit("conversation:join", conversation._id);
      },

      removeConversation: (conversationId) => {
        set((state) => ({
          conversations: state.conversations.filter(
            (conversation) => conversation._id !== conversationId,
          ),
          activeConversationId:
            state.activeConversationId === conversationId
              ? null
              : state.activeConversationId,
          messages:
            state.activeConversationId === conversationId ? [] : state.messages,
        }));
      },

      markRead: async (conversationId) => {
        if (!conversationId) return;

        // Optimistic: clear the badge immediately.
        set((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation._id === conversationId
              ? { ...conversation, unreadCount: 0 }
              : conversation,
          ),
        }));

        try {
          await axiosInstance.post(`/conversations/${conversationId}/read`);
        } catch {
          /* non-critical */
        }
      },

      /** Best-effort delivery receipt so senders see double ticks. */
      markDelivered: (conversationId) => {
        if (!conversationId) return;
        if (deliveredTimers.has(conversationId)) return;

        // Coalesce bursts of incoming messages into one request.
        deliveredTimers.set(
          conversationId,
          setTimeout(async () => {
            deliveredTimers.delete(conversationId);
            try {
              await axiosInstance.post(
                `/conversations/${conversationId}/delivered`,
              );
            } catch {
              /* non-critical */
            }
          }, 800),
        );
      },

      // =====================================================================
      // Messages
      // =====================================================================
      getMessages: async (conversationId, { older = false, silent = false } = {}) => {
        if (!conversationId) return;

        if (older) {
          if (!get().hasMore || get().isLoadingOlder) return;
          set({ isLoadingOlder: true });
        } else if (!silent) {
          set({ isLoadingMessages: true, messages: [] });
        }

        try {
          const params = older ? { before: get().nextCursor, limit: 50 } : { limit: 50 };
          const res = await axiosInstance.get(
            `/conversations/${conversationId}/messages`,
            { params },
          );

          const incoming = res.data.messages || [];

          set((state) => {
            if (String(state.activeConversationId) !== String(conversationId)) {
              return {};
            }

            if (!older) {
              // A silent refresh (reconnect) must not drop pages the user
              // already scrolled back through.
              const keepPagination = silent && state.messages.length > incoming.length;

              return {
                messages: silent ? mergeMessages(state.messages, incoming) : incoming,
                hasMore: keepPagination ? state.hasMore : Boolean(res.data.hasMore),
                nextCursor: keepPagination ? state.nextCursor : res.data.nextCursor,
              };
            }

            const seen = new Set(state.messages.map((message) => message._id));
            const merged = [
              ...incoming.filter((message) => !seen.has(message._id)),
              ...state.messages,
            ];

            return {
              messages: merged,
              hasMore: Boolean(res.data.hasMore),
              nextCursor: res.data.nextCursor,
            };
          });

          if (!older) {
            get().markRead(conversationId);
            get().markDelivered(conversationId);
          }
        } catch (error) {
          toast.error(
            error.response?.data?.message || "Failed to load messages",
          );
        } finally {
          set({ isLoadingMessages: false, isLoadingOlder: false });
        }
      },

      appendMessage: (conversationId, message) => {
        set((state) => {
          if (String(state.activeConversationId) !== String(conversationId)) {
            return {};
          }

          // A real message arriving with a clientId is the server's version of
          // one of our optimistic messages: replace it in place.
          if (message.clientId) {
            const index = state.messages.findIndex(
              (item) => item.pending && item.clientId === message.clientId,
            );
            if (index >= 0) {
              revokeMediaPreviews(state.messages[index]);
              const next = state.messages.slice();
              next[index] = message;
              return { messages: next };
            }
          }

          if (state.messages.some((item) => item._id === message._id)) return {};
          return { messages: [...state.messages, message] };
        });
      },

      replaceMessage: (conversationId, message) => {
        set((state) => {
          if (String(state.activeConversationId) !== String(conversationId)) {
            return {};
          }
          return {
            messages: state.messages.map((item) =>
              item._id === message._id ? message : item,
            ),
          };
        });
      },

      sendMessage: async (args = {}) => {
        const { retryOf = null, ...firstAttempt } = args;
        const conversationId = String(
          retryOf?.conversationId || firstAttempt.conversationId || "",
        );
        if (!conversationId) return false;

        const me = useAuthStore.getState().authUser;
        if (!me) return false;

        const { text = "", file = null, audioBlob = null, audioDuration = 0 } =
          retryOf ? retryOf.payload : firstAttempt;
        // A retry carries the replyTo captured at first attempt (the live
        // composer state was cleared long ago).
        const replyTo = retryOf ? retryOf.replyTo ?? null : get().replyTo;
        // A retry keeps its clientId: if the first attempt actually reached
        // the server (lost response), idempotency still prevents duplicates.
        const clientId = retryOf?.clientId || firstAttempt.clientId || newClientId();

        let form = retryOf?.form ?? null;
        if (!form) {
          form = new FormData();
          const trimmed = String(text || "").trim();

          if (trimmed) form.append("text", trimmed);
          form.append("clientId", clientId);

          if (file) form.append("media", file);

          if (audioBlob) {
            const type = audioBlob.type || "audio/webm";
            const extension = type.includes("mp4") ? "m4a" : "webm";
            form.append(
              "media",
              new File([audioBlob], `voice-${Date.now()}.${extension}`, { type }),
            );
            form.append("audioDuration", String(Math.round(audioDuration || 0)));
          }

          if (replyTo?._id) form.append("replyToId", replyTo._id);
        }

        // Snapshot so a failed send can be retried from anywhere in the UI.
        pendingPayloads.set(clientId, {
          conversationId,
          clientId,
          replyTo,
          payload: { text, file, audioBlob, audioDuration },
          form,
        });

        const optimistic = buildOptimisticMessage({
          clientId,
          conversationId,
          me,
          text: String(text || "").trim(),
          file,
          audioBlob,
          audioDuration,
          replyTo,
        });

        // Show it instantly; the server confirmation swaps it out by clientId.
        get().appendMessage(conversationId, optimistic);

        set({ composerText: "", replyTo: null });

        // Keep the sidebar preview moving too, so nothing waits on the wire.
        set((state) => ({
          conversations: sortConversations(
            state.conversations.map((conversation) =>
              conversation._id === conversationId
                ? {
                    ...conversation,
                    lastMessage: {
                      text: previewText(optimistic),
                      senderId: me._id,
                      senderName: me.fullName,
                      kind: messageKind(optimistic),
                      createdAt: optimistic.createdAt,
                    },
                    lastMessageAt: optimistic.createdAt,
                  }
                : conversation,
            ),
          ),
        }));

        try {
          const hasPayload = Boolean(file || audioBlob);
          const res = await axiosInstance.post(
            `/conversations/${conversationId}/messages`,
            form,
            hasPayload
              ? {
                  onUploadProgress: (event) => {
                    if (!event.total) return;
                    set({
                      mediaUploadProgress: Math.min(
                        100,
                        Math.round((event.loaded / event.total) * 100),
                      ),
                    });
                  },
                }
              : undefined,
          );
          pendingPayloads.delete(clientId);
          set({ mediaUploadProgress: 0 });
          get().appendMessage(conversationId, res.data);
          return true;
        } catch (error) {
          // Keep the payload so the failed bubble can be retried.
          set({ mediaUploadProgress: 0 });

          set((state) => ({
            messages:
              String(state.activeConversationId) === conversationId
                ? state.messages.map((message) =>
                    message.clientId === clientId && message.pending
                      ? { ...message, pending: false, failed: true }
                      : message,
                  )
                : state.messages,
          }));

          toast.error(
            error.response?.data?.message || "Message failed to send",
          );
          return false;
        }
      },

      retryMessage: async (clientId) => {
        const record = pendingPayloads.get(clientId);
        const me = useAuthStore.getState().authUser;

        if (!record || !me) {
          // No payload left (e.g. after a reload): just drop the dead bubble.
          set((state) => ({
            messages: state.messages.map((message) => {
              if (message.clientId === clientId) {
                revokeMediaPreviews(message);
                return null;
              }
              return message;
            }).filter(Boolean),
          }));
          pendingPayloads.delete(clientId);
          return false;
        }

        pendingPayloads.delete(clientId);
        // Remove the failed copy; the retry re-adds it optimistically.
        set((state) => ({
          messages: state.messages
            .map((message) => {
              if (message.clientId === clientId) {
                revokeMediaPreviews(message);
                return null;
              }
              return message;
            })
            .filter(Boolean),
        }));

        return get().sendMessage({
          conversationId: record.conversationId,
          clientId: record.clientId,
          replyTo: record.replyTo,
          ...record.payload,
        });
      },

      sendTextMessage: async (conversationId) => {
        const { composerText } = get();
        if (!conversationId || !composerText.trim()) return false;
        return get().sendMessage({ conversationId, text: composerText });
      },

      sendMediaMessage: async ({ conversationId, file }) => {
        if (!conversationId || !file) return false;
        set({ isSendingMedia: true });
        try {
          return await get().sendMessage({ conversationId, file });
        } finally {
          set({ isSendingMedia: false });
        }
      },

      sendVoiceMessage: async ({ conversationId, blob, duration }) => {
        if (!conversationId || !blob) return false;
        set({ isSendingMedia: true });
        try {
          return await get().sendMessage({
            conversationId,
            audioBlob: blob,
            audioDuration: duration,
          });
        } finally {
          set({ isSendingMedia: false });
        }
      },

      editMessage: async (messageId, text) => {
        try {
          const res = await axiosInstance.patch(`/messages/${messageId}`, { text });
          get().replaceMessage(res.data.conversationId, res.data);
          set({ editingMessage: null });
          return true;
        } catch (error) {
          toast.error(error.response?.data?.message || "Could not edit message");
          return false;
        }
      },

      deleteMessage: async (message, { forEveryone = true } = {}) => {
        try {
          await axiosInstance.delete(`/messages/${message._id}`, {
            params: { forEveryone },
          });

          if (!forEveryone) {
            set((state) => ({
              messages: state.messages.filter((item) => item._id !== message._id),
            }));
          } else {
            // Reflect the tombstone immediately; the socket event is a no-op
            // duplicate when it arrives.
            set((state) => ({
              messages: state.messages.map((item) =>
                item._id === message._id
                  ? {
                      ...item,
                      text: "",
                      image: "",
                      video: "",
                      audio: "",
                      poll: null,
                      reactions: [],
                      deletedAt: new Date().toISOString(),
                    }
                  : item,
              ),
            }));
          }

          return true;
        } catch (error) {
          toast.error(error.response?.data?.message || "Could not delete message");
          return false;
        }
      },

      reactToMessage: async (messageId, emoji) => {
        try {
          const res = await axiosInstance.post(`/messages/${messageId}/reactions`, {
            emoji,
          });
          get().replaceMessage(res.data.conversationId, res.data);
        } catch (error) {
          toast.error(error.response?.data?.message || "Could not react");
        }
      },

      votePoll: async (messageId, optionId) => {
        try {
          const res = await axiosInstance.post(`/messages/${messageId}/vote`, {
            optionId,
          });
          get().replaceMessage(res.data.conversationId, res.data);
        } catch (error) {
          toast.error(error.response?.data?.message || "Could not vote");
        }
      },

      pinMessage: async (messageId) => {
        try {
          const res = await axiosInstance.post(`/messages/${messageId}/pin`);
          set((state) => ({
            conversations: state.conversations.map((conversation) =>
              conversation._id === get().activeConversationId
                ? { ...conversation, pinnedMessages: res.data.pinnedMessages }
                : conversation,
            ),
          }));
          toast.success(res.data.pinned ? "Pinned to this chat" : "Unpinned");
        } catch (error) {
          toast.error(error.response?.data?.message || "Could not pin message");
        }
      },

      createPoll: async (conversationId, { question, options, multiple }) => {
        try {
          const res = await axiosInstance.post(`/conversations/${conversationId}/polls`, {
            question,
            options,
            multiple,
          });
          get().appendMessage(conversationId, res.data);
          return true;
        } catch (error) {
          toast.error(error.response?.data?.message || "Could not create poll");
          return false;
        }
      },

      // =====================================================================
      // Composer helpers
      // =====================================================================
      setReplyTo: (message) => set({ replyTo: message, editingMessage: null }),
      cancelReply: () => set({ replyTo: null }),
      startEditing: (message) =>
        set({ editingMessage: message, replyTo: null, composerText: message.text || "" }),
      cancelEditing: () => set({ editingMessage: null, composerText: "" }),

      setComposerText: (composerText) => set({ composerText }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setSidebarTab: (sidebarTab) => set({ sidebarTab }),
      setSoundEnabled: (isSoundEnabled) => set({ isSoundEnabled }),
      setIsRecording: (isRecording) => set({ isRecording }),

      // =====================================================================
      // Search
      // =====================================================================
      searchMessages: async (term, conversationId) => {
        if (!term || term.trim().length < 2) {
          set({ searchResults: [], isSearching: false });
          return;
        }

        set({ isSearching: true });
        try {
          const res = await axiosInstance.get("/messages/search", {
            params: { q: term.trim(), conversationId },
          });
          set({ searchResults: res.data });
        } catch {
          set({ searchResults: [] });
        } finally {
          set({ isSearching: false });
        }
      },

      clearSearch: () => set({ searchResults: [], isSearching: false }),

      // =====================================================================
      // Realtime
      // =====================================================================
      sendTyping: (conversationId, typing) => {
        const socket = useAuthStore.getState().socket;
        if (!socket || !conversationId) return;
        socket.emit(typing ? "typing:start" : "typing:stop", { conversationId });
      },

      subscribeToEvents: () => {
        const socket = useAuthStore.getState().socket;
        if (!socket) return;

        const handlers = {
          "message:new": ({ conversationId, message }) => {
            const state = get();
            const meId = useAuthStore.getState().authUser?._id;
            const fromMe = String(message.senderId) === String(meId);

            state.appendMessage(conversationId, message);

            // Arriving on this device counts as delivered, even if unfocused.
            if (!fromMe) get().markDelivered(conversationId);

            set((current) => ({
              conversations: sortConversations(
                current.conversations.map((conversation) =>
                  conversation._id === conversationId
                    ? {
                        ...conversation,
                        lastMessage: {
                          text: previewText(message),
                          senderId: message.senderId,
                          senderName: message.sender?.fullName || "",
                          kind: messageKind(message),
                          createdAt: message.createdAt,
                        },
                        lastMessageAt: message.createdAt,
                        unreadCount: fromMe
                          ? conversation.unreadCount || 0
                          : String(current.activeConversationId) === String(conversationId)
                            ? 0
                            : (conversation.unreadCount || 0) + 1,
                      }
                    : conversation,
                ),
              ),
            }));

            if (
              String(state.activeConversationId) === String(conversationId) &&
              !fromMe &&
              document.hasFocus()
            ) {
              get().markRead(conversationId);
            }
          },

          "message:updated": ({ conversationId, message }) => {
            get().replaceMessage(conversationId, message);
          },

          "message:deleted": ({ conversationId, message }) => {
            get().replaceMessage(conversationId, message);
          },

          "conversation:read": ({ conversationId, userId, at }) => {
            const meId = useAuthStore.getState().authUser?._id;
            if (String(get().activeConversationId) !== String(conversationId)) return;

            const readAt = new Date(at).getTime();

            set((state) => ({
              messages: state.messages.map((message) => {
                if (String(message.senderId) !== String(meId)) return message;
                if (new Date(message.createdAt).getTime() > readAt) return message;
                if (message.readBy?.some((receipt) => receipt.userId === userId)) {
                  return message;
                }
                return {
                  ...message,
                  readBy: [...(message.readBy || []), { userId, at }],
                };
              }),
            }));
          },

          "conversation:new": ({ conversation }) => {
            if (conversation?.members?.some((m) => m._id === useAuthStore.getState().authUser?._id)) {
              get().addConversation(conversation);
            }
          },

          "conversation:updated": ({ conversation }) => {
            set((state) => ({
              conversations: state.conversations.map((item) =>
                item._id === conversation._id ? { ...item, ...conversation } : item,
              ),
            }));
          },

          "conversation:pins": ({ conversationId, pinnedMessages }) => {
            set((state) => ({
              conversations: state.conversations.map((conversation) =>
                conversation._id === conversationId
                  ? { ...conversation, pinnedMessages }
                  : conversation,
              ),
            }));
          },

          "conversation:removed": ({ conversationId }) => {
            get().removeConversation(conversationId);
          },

          typing: ({ conversationId, userId, name, typing }) => {
            const key = `${conversationId}:${userId}`;
            if (typingTimers.has(key)) clearTimeout(typingTimers.get(key));

            if (typing) {
              typingTimers.set(
                key,
                setTimeout(() => {
                  typingTimers.delete(key);
                  set((state) => ({
                    typingByConversation: {
                      ...state.typingByConversation,
                      [conversationId]: (
                        state.typingByConversation[conversationId] || []
                      ).filter((entry) => entry.userId !== userId),
                    },
                  }));
                }, 6000),
              );
            }

            set((state) => {
              const existing = (
                state.typingByConversation[conversationId] || []
              ).filter((entry) => entry.userId !== userId);

              const next = typing
                ? [...existing, { userId, name, at: Date.now() }]
                : existing;

              return {
                typingByConversation: {
                  ...state.typingByConversation,
                  [conversationId]: next,
                },
              };
            });
          },

          "sync:now": () => {
            get().getConversations({ silent: true });
            const activeId = get().activeConversationId;
            if (activeId) get().getMessages(activeId, { silent: true });
          },
        };

        for (const [event, handler] of Object.entries(handlers)) {
          socket.off(event);
          socket.on(event, handler);
        }
      },

      unsubscribeFromEvents: () => {
        const socket = useAuthStore.getState().socket;
        if (!socket) return;
        for (const event of [
          "message:new",
          "message:updated",
          "message:deleted",
          "conversation:read",
          "conversation:new",
          "conversation:updated",
          "conversation:pins",
          "conversation:removed",
          "typing",
          "sync:now",
        ]) {
          socket.off(event);
        }
      },
    }),
    {
      name: "shamak-storage",
      partialize: (state) => ({ isSoundEnabled: state.isSoundEnabled }),
    },
  ),
);
