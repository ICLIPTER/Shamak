import express from "express";
import cors from "cors";
import compression from "compression";

import "dotenv/config";

import fs from "fs";
import path from "path";

import cookieParser from "cookie-parser";

import { connectDB } from "./lib/db.js";
import job from "./lib/cron.js";

import authRoutes from "./routes/auth.route.js";
import conversationRoutes from "./routes/conversation.route.js";
import messageRoutes from "./routes/message.route.js";
import userRoutes from "./routes/user.route.js";
import inviteRoutes from "./routes/invite.route.js";
import pushRoutes from "./routes/push.route.js";
import { eventRouter, noteRouter } from "./routes/family.route.js";
import { apiLimiter } from "./middleware/rateLimit.middleware.js";
import { app, server } from "./lib/socket.js";

const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === "production";

// FRONTEND_URL may hold one origin or a comma-separated list.
const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const publicDir = path.join(process.cwd(), "public");

if (IS_PROD) {
  const required = [
    "MONGO_URI",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "OWNER_EMAIL",
    "OWNER_PASSWORD",
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
  }
  if (!allowedOrigins.length) {
    console.warn(
      "FRONTEND_URL is not set; cross-origin requests will not be restricted.",
    );
  }
}

// Hide the framework and add a few cheap, safe headers.
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");
  next();
});

app.use(compression());

// Abuse protection for the whole API (see rateLimit.middleware.js).
app.use(apiLimiter);

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true,
  }),
);

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true, uptime: process.uptime() });
});

app.use("/api/auth", authRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/users", userRoutes);
app.use("/api/invites", inviteRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/events", eventRouter);
app.use("/api/notes", noteRouter);

// Unknown API routes should answer JSON, never the SPA shell.
app.use("/api/{*any}", (req, res) => {
  res.status(404).json({ message: "Not found" });
});

// if the public directory exists, serve the static files
// this is for the production build
if (fs.existsSync(publicDir)) {
  app.use(
    express.static(publicDir, {
      maxAge: "1y",
      immutable: true,
      setHeaders: (res, filePath) => {
        // The service worker and HTML must never be cached aggressively.
        if (
          filePath.endsWith("sw.js") ||
          filePath.endsWith("index.html") ||
          filePath.endsWith("manifest.webmanifest")
        ) {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    }),
  );

  app.get("/{*any}", (req, res, next) => {
    // Never let the SPA shell swallow a missing API route.
    if (req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile(path.join(publicDir, "index.html"), (err) => next(err));
  });
}

// Central error handler — keeps multer/validation errors JSON, not HTML.
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (error?.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ message: "That file is too large (50 MB max)" });
    return;
  }

  if (error?.message?.startsWith("Only image")) {
    res.status(415).json({ message: error.message });
    return;
  }

  console.error("Unhandled error:", error);
  res.status(500).json({ message: "Internal server error" });
});

server.listen(PORT, () => {
  connectDB();
  console.log("Server is up and running on PORT:", PORT);

  if (IS_PROD) job.start();
});

let shuttingDown = false;

/** Let in-flight requests finish before the container is killed. */
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down…`);

  job.stop?.();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
