/**
 * Client-side image compression before upload.
 *
 * Phone cameras produce 3-8 MB JPEGs; resized to a chat bubble they all fit
 * in ~150-300 KB. Compressing here makes uploads ~10x faster (the sender not
 * waiting), and cuts backend bandwidth since the file crosses the wire once.
 *
 * Everything is best-effort: if decoding fails (HEIC on some browsers), the
 * format is animated (gif), or the result is somehow larger, we return the
 * original file untouched.
 */

const MAX_DIMENSION = 1600;
const QUALITY = 0.8;

export function shouldCompress(file) {
  const type = file?.type || "";
  // Animated images would lose their animation; leave them alone.
  return type.startsWith("image/") && !type.includes("gif");
}

async function decodeImage(file) {
  // createImageBitmap is available in every modern browser and gives accurate
  // EXIF orientation (unlike a manual Image() draw).
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to the Image() fallback (e.g. Safari + HEIC) */
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    return image;
  } finally {
    // decode() completes before we get here, so the URL is spent.
    URL.revokeObjectURL(objectUrl);
  }
}

function drawScaledPixels(bitmap) {
  const width = bitmap.width || bitmap.naturalWidth;
  const height = bitmap.height || bitmap.naturalHeight;
  if (!width || !height) return null;

  // Downscale proportionally so the long edge fits the limit.
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Canvas → Blob as WebP (JPEG/PNG fallback where WebP is unsupported). */
function canvasToBlob(canvas, type) {
  return new Promise((resolve) => {
    try {
      canvas.toBlob(resolve, type, QUALITY);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Compress an image file for chat upload.
 * @returns {Promise<File>} the compressed WebP file, or the original file.
 */
export async function compressImage(file) {
  if (!shouldCompress(file) || typeof document === "undefined") return file;

  try {
    const bitmap = await decodeImage(file);
    if (!bitmap) return file;

    const canvas = drawScaledPixels(bitmap);
    // Explicitly release the decoded bitmap's memory.
    bitmap.close?.();
    if (!canvas) return file;

    let blob = await canvasToBlob(canvas, "image/webp");
    if (!blob) {
      // WebP unsupported (very old Safari): graceful JPEG fallback.
      blob = await canvasToBlob(canvas, "image/jpeg");
    }
    if (!blob) return file;

    // A "smaller" file that is somehow bigger than the source is a waste.
    if (blob.size >= file.size) return file;

    const extension = blob.type === "image/jpeg" ? "jpg" : "webp";
    const name = `photo-${Date.now()}.${extension}`;
    return new File([blob], name, { type: blob.type });
  } catch {
    // Compression must never block a send.
    return file;
  }
}
