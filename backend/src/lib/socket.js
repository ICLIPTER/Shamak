import express from "express";
import http from "http";
import { Server } from "socket.io";
import { verifyAccessToken } from "./token.js";

import User from "../models/user.model.js";
import Conversation from "../models/conversation.model.js";

const app = express();
const server = http.createServer(app);

const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true },
  // Keep the payload small; these are chat messages, not files.
  maxHttpBufferSize: 2e6,
  pingTimeout: 25000,
  pingInterval: 20000,
});

/** userId (string) -> Set<socketId> — a person may have phone + laptop open. */
const userSockets = new Map();

function addSocket(userId, socketId) {
  const set = userSockets.get(userId) ?? new Set();
  set.add(socketId);
  userSockets.set(userId, set);
}

function removeSocket(userId, socketId) {
  const set = userSockets.get(userId);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) userSockets.delete(userId);
}

export function isUserOnline(userId) {
  return userSockets.has(String(userId));
}

export function getOnlineUserIds() {
  return [...userSockets.keys()];
}

export function emitToUser(userId, event, payload) {
  const set = userSockets.get(String(userId));
  if (!set) return;
  for (const socketId of set) io.to(socketId).emit(event, payload);
}

export function emitToConversation(conversationId, event, payload) {
  io.to(`conv:${String(conversationId)}`).emit(event, payload);
}

/** Backwards-compatible helper used by older call sites. */
export function getReceiverSocketId(userId) {
  const set = userSockets.get(String(userId));
  return set ? [...set][0] : undefined;
}

// ---- Authentication -------------------------------------------------------
// The client's userId is never trusted. Every socket must present a valid
// access token, and we resolve the real user from it.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Unauthorized"));

    const payload = verifyAccessToken(token);
    if (!payload) return next(new Error("Unauthorized"));

    const user = await User.findById(payload.userId).select(
      "_id isApproved fullName",
    );

    if (!user) return next(new Error("Unauthorized"));
    if (user.isApproved === false) return next(new Error("Not approved"));

    socket.userId = String(user._id);
    socket.displayName = user.fullName;
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", async (socket) => {
  const { userId } = socket;

  // True if this user was offline everywhere before this socket.
  const isFirstSession = !userSockets.has(userId);
  addSocket(userId, socket.id);

  socket.join(`user:${userId}`);

  // Join every conversation room so broadcasts reach this socket.
  try {
    const conversations = await Conversation.find({ members: userId }).select(
      "_id",
    );
    for (const conversation of conversations) {
      socket.join(`conv:${conversation._id}`);
    }
  } catch (error) {
    console.error("Failed to join conversation rooms:", error.message);
  }

  // Full presence snapshot only for the connecting socket; everyone else
  // gets a tiny delta (see presence:update below). At scale, broadcasting
  // the whole list on every connect/disconnect is a storm.
  socket.emit("getOnlineUsers", getOnlineUserIds());
  if (isFirstSession) {
    socket.broadcast.emit("presence:update", { userId, online: true });
  }

  const inConversation = (conversationId) =>
    Boolean(conversationId) && socket.rooms.has(`conv:${conversationId}`);

  socket.on("conversation:join", async (conversationId) => {
    if (!conversationId) return;

    // Never trust the client: only join a room for a conversation this
    // member actually belongs to.
    try {
      const member = await Conversation.exists({
        _id: conversationId,
        members: userId,
      });
      if (member) socket.join(`conv:${conversationId}`);
    } catch {
      /* invalid id */
    }
  });

  // The client asks for a resync after reconnecting so it never renders a
  // stale conversation list.
  socket.on("request:sync", () => {
    socket.emit("sync:now");
  });

  socket.on("typing:start", ({ conversationId } = {}) => {
    if (!inConversation(conversationId)) return;
    socket.to(`conv:${conversationId}`).emit("typing", {
      conversationId: String(conversationId),
      userId,
      name: socket.displayName,
      typing: true,
    });
  });

  socket.on("typing:stop", ({ conversationId } = {}) => {
    if (!inConversation(conversationId)) return;
    socket.to(`conv:${conversationId}`).emit("typing", {
      conversationId: String(conversationId),
      userId,
      name: socket.displayName,
      typing: false,
    });
  });

  socket.on("disconnect", () => {
    removeSocket(userId, socket.id);

    if (!isUserOnline(userId)) {
      User.updateOne({ _id: userId }, { lastSeenAt: new Date() }).catch(() => {
        /* presence is best-effort */
      });

      // Delta instead of the full list: everyone learns one user went offline.
      socket.broadcast.emit("presence:update", { userId, online: false });

      // Tell the room to clear this person's typing indicator.
      for (const room of socket.rooms) {
        if (room.startsWith("conv:")) {
          socket.to(room).emit("typing", {
            conversationId: room.slice(5),
            userId,
            typing: false,
          });
        }
      }
    }
  });
});

export { app, server, io };
