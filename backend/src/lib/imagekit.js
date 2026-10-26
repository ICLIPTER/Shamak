import fs from "node:fs";

import ImageKit, { toFile } from "@imagekit/nodejs";

const imagekit = new ImageKit({ privateKey: process.env.IMAGEKIT_PRIVATE_KEY });

function hasImageKitConfig() {
  return Boolean(process.env.IMAGEKIT_PRIVATE_KEY);
}

// originalName= "My Photo (1).png"
// result: "chat-1749300000000-My_Photo__1_.png"
// this helper makes a safe, unique filename for uploaded files.
function createFileName(originalName = "upload") {
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `chat-${Date.now()}-${safeName}`;
}

/**
 * Upload image, video, or voice note to ImageKit.
 * The multer file is streamed straight from the temp dir on disk, so large
 * videos never buffer in server memory.
 * @see https://imagekit.io/docs/api-reference/upload-file/upload-file
 */
async function uploadChatMedia(file) {
  const fileName = createFileName(file.originalname || "upload");

  const source = file.path ? fs.createReadStream(file.path) : file.buffer;

  const result = await imagekit.files.upload({
    file: await toFile(source, fileName, { type: file.mimetype }),
    fileName,
    folder: "/chat",
  });

  return result.url;
}

export { uploadChatMedia, hasImageKitConfig };
