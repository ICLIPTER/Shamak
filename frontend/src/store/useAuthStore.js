import { create } from "zustand";
import { io } from "socket.io-client";

import { axiosInstance, API_ORIGIN } from "../lib/axios";

// Empty string means "same origin as the page".
const BASE_URL = API_ORIGIN || undefined;

/**
 * Auth + realtime connection.
 *
 * The socket authenticates with a Clerk session token; the server never trusts
 * a client-provided user id.
 */
export const useAuthStore = create((set, get) => ({
  authUser: null,
  isCheckingAuth: true,
  onlineUsers: [],
  socket: null,
  tokenGetter: null,
  authError: null,

  setTokenGetter: (tokenGetter) => set({ tokenGetter }),

  checkAuth: async () => {
    set({ isCheckingAuth: true, authError: null });

    try {
      const res = await axiosInstance.get("/auth/check");
      set({ authUser: res.data });

      if (res.data?.isApproved !== false) get().connectSocket();
    } catch (error) {
      if (error.response?.status === 404) {
        // Webhook hasn't synced the profile yet; keep the session but retry.
        set({ authUser: null, authError: "SYNCING" });
      } else {
        console.error("Error in checkAuth:", error.message);
        set({ authUser: null, authError: error.response?.data?.message || "AUTH" });
      }
    } finally {
      set({ isCheckingAuth: false });
    }
  },

  refreshAuth: async () => {
    try {
      const res = await axiosInstance.get("/auth/check");
      set({ authUser: res.data, authError: null });
      if (res.data?.isApproved !== false) get().connectSocket();
      return res.data;
    } catch (error) {
      console.error("Error refreshing auth:", error.message);
      return null;
    }
  },

  setAuthUser: (authUser) => set({ authUser }),

  clearAuth: () => {
    set({ authUser: null, isCheckingAuth: false, onlineUsers: [], authError: null });
    get().disconnectSocket();
  },

  connectSocket: () => {
    const existing = get().socket;
    if (existing?.connected) return;
    if (existing) existing.disconnect();

    const socket = io(BASE_URL, {
      // Socket.io calls this again on every reconnect, so tokens stay fresh.
      auth: async (callback) => {
        const getToken = get().tokenGetter;
        try {
          const token = getToken ? await getToken() : null;
          callback({ token });
        } catch {
          callback({ token: null });
        }
      },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });

    socket.on("getOnlineUsers", (userIds) => {
      set({ onlineUsers: userIds || [] });
    });

    socket.on("connect_error", (error) => {
      if (error?.message === "Unauthorized" || error?.message === "Not approved") {
        set({ authError: error.message });
      }
    });

    // A returning connection should resync anything missed while offline.
    socket.on("connect", () => {
      set({ authError: null });
      socket.emit("request:sync");
    });

    set({ socket });
  },

  disconnectSocket: () => {
    const socket = get().socket;
    if (socket) socket.disconnect();
    set({ socket: null });
  },
}));
