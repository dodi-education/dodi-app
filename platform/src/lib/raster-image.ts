/**
 * Tell a raster image's type from its own first bytes, never from the label a
 * client put on it. Used where the platform stores or serves image bytes that
 * a user sent (feedback attachments): a file is only kept, and only ever
 * served, as one of the types it really is, so nothing labelled as an image
 * can turn into markup (an SVG or HTML) in a browser.
 */

export type RasterImageType = "image/jpeg" | "image/png" | "image/webp";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0));
}

/** JPEG, PNG or WebP by signature, or null for anything else. */
export function detectRasterImageType(bytes: Uint8Array): RasterImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, PNG_SIGNATURE)) return "image/png";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "image/webp";
  return null;
}

/** The file extension that goes with a detected type. */
export function rasterImageExtension(type: RasterImageType): "jpg" | "png" | "webp" {
  if (type === "image/jpeg") return "jpg";
  return type === "image/png" ? "png" : "webp";
}
