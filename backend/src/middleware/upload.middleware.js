import multer from "multer";

const MB = 1024 * 1024;

// Images/voice notes are small; video needs more room. One limit keeps the
// upload path simple and predictable for a family server.
const MAX_FILE_SIZE = 50 * MB;

function classify(file) {
  const mime = file.mimetype || "";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

export const upload = multer({
  storage: multer.memoryStorage(),
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

export { classify };
