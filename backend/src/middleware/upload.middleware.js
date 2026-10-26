import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import multer from "multer";
import crypto from "node:crypto";

const MB = 1024 * 1024;

// Images/voice notes are small; video needs more room. One limit keeps the
// upload path simple and predictable for a family server.
const MAX_FILE_SIZE = 50 * MB;

// Disk buffering instead of RAM: a small host (512 MB) cannot safely hold
// multiple 50 MB video uploads in memory while the client stream is open.
const uploadDir = path.join(os.tmpdir(), "shamak-uploads");

function ensureUploadDir() {
  fs.mkdirSync(uploadDir, { recursive: true });
  return uploadDir;
}

function classify(file) {
  const mime = file.mimetype || "";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

export const upload = multer({
  // Files land in an OS temp dir; the controller streams them onward to
  // ImageKit and deletes them afterwards.
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      try {
        cb(null, ensureUploadDir());
      } catch (error) {
        cb(error);
      }
    },
    filename: (_req, file, cb) => {
      // Random name — the original name is untrusted input from the network.
      const extension = path.extname(file.originalname || "").slice(0, 10);
      cb(null, `upload-${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    const kind = classify(file);

    if (!kind) {
      cb(new Error("Only image, video, and audio uploads are allowed"));
      return;
    }

    // Handy for the controller so it doesn't re-derive the type.
    file.kind = kind;
    cb(null, true);
  },
});

/** Best-effort temp-file cleanup; never let cleanup failure break a response. */
export function discardUpload(file) {
  if (!file?.path) return;
  fs.promises.rm(file.path, { force: true }).catch(() => {
    /* temp files also get cleared by the OS */
  });
}

export { classify };
