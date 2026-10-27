import { create } from "zustand";
import { io } from "socket.io-client";

import { axiosInstance, API_ORIGIN } from "../lib/axios";
import {
  SESSION_EXPIRED_EVENT,
  getToken,
  setToken,
} from "../lib/auth-token.js";

// Empty string means "same origin as the page".
const BASE_URL = API_ORIGIN || undefined;

/**
 * Auth + realtime connection.
 *
 * The socket authenticates with our own access token (never the
 * client-provided user id). The HttpOnly refresh cookie is not accessible to
 * JavaScript by design; the axios interceptor renews the access token using
 * it whenever the API answers 401.
 */
export const useAuthStore = create((set, get) => ({
  // Mirrored so React re-renders when the session changes; localStorage
  // survives reloads.
  accessToken: getToken(),
  authUser: null,
  isCheckingAuth: Boolean(getToken()),
  onlineUsers: [],
  socket: null,
  authError: null,

  setAuthUser: (authUser) => set({ authUser }),

  /**
   * Sign up. Returns { ok, needsApproval } — the server may create the
   * account but still wait for admin approval.
   */
  register: async (fullName, email, password) => {
    const res = await axiosInstance.post("/auth/register", {
      fullName,
      email,
      password,
    });
    setToken(res.data.token);
    set({
      accessToken: res.data.token,
      authUser: res.data.user,
      authError: null,
      isCheckingAuth: false,
    });
    if (res.data.user?.isApproved !== false) get().connectSocket();
    return res.data.user;
  },

  /** Sign in. Throws so the form can show the server's error message. */
  login: async (email, password) => {
    const res = await axiosInstance.post("/auth/login", { email, password });
    setToken(res.data.token);
    set({
      accessToken: res.data.token,
      authUser: res.data.user,
      authError: null,
      isCheckingAuth: false,
    });
    if (res.data.user?.isApproved !== false) get().connectSocket();
    return res.data.user;
  },

  checkAuth: async () => {
    if (!getToken()) {
      set({ authUser: null, authError: null, isCheckingAuth: false });
      return null;
    }

    set({ isCheckingAuth: true, authError: null });

    try {
      const res = await axiosInstance.get("/auth/check");
      set({ authUser: res.data });

      if (res.data?.isApproved !== false) get().connectSocket();
      return res.data;
    } catch (error) {
      console.error("Error in checkAuth:", error.message);
      set({
        authUser: null,
        authError: error.response?.data?.message || "AUTH",
      });
      return null;
    } finally {
      set({ isCheckingAuth: false });
    }
  },

  /**
   * Refresh the cached profile after a same-session change (e.g. an invite
   * code unlocked the account).
   */
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

  clearAuth: () => {
    set({
      accessToken: null,
      authUser: null,
      isCheckingAuth: false,
      onlineUsers: [],
      authError: null,
    });
    setToken(null);
    get().disconnectSocket();
  },

  /** Sign out: drop the refresh cookie server-side and forget everything. */
  logout: async () => {
    try {
      await axiosInstance.post("/auth/logout");
    } catch {
      /* clearing locally is what matters */
    }
    get().clearAuth();
  },

  connectSocket: () => {
    const existing = get().socket;
    if (existing?.connected) return;
    if (existing) existing.disconnect();

    const socket = io(BASE_URL, {
      // Socket.io calls this again on every reconnect, so an access token
      // renewed by the axios interceptor is picked up automatically.
      auth: (callback) => callback({ token: getToken() }),
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });

    socket.on("getOnlineUsers", (userIds) => {
      set({ onlineUsers: userIds || [] });
    });

    // Incremental presence deltas (connects/disconnects after ours).
    socket.on("presence:update", ({ userId, online }) => {
      set((state) => ({
        onlineUsers: online
          ? state.onlineUsers.includes(userId)
            ? state.onlineUsers
            : [...state.onlineUsers, userId]
          : state.onlineUsers.filter((id) => id !== userId),
      }));
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

// The axios interceptor fires this when the refresh cookie answers 401 —
// i.e. the refresh token expired or was revoked. Drop everything so the
// app shows the sign-in page.
window.addEventListener(SESSION_EXPIRED_EVENT, () => {
  useAuthStore.getState().clearAuth();
});
