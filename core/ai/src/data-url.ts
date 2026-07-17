/**
 * Image data-URL parsing shared by every browser→model vision path (game-state
 * analysis, studio reference images, edit-time screenshots). Providers accept
 * different image shapes, but all of ours start life as a data URL.
 */

const IMAGE_DATA_URL_RE = /^data:image\/(png|jpeg|gif|webp);base64,(.+)$/;

export type ImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

export interface ParsedImageDataUrl {
  mediaType: ImageMediaType;
  base64: string;
}

/** Parse a `data:image/...;base64,...` URL; null for anything else. */
export function parseImageDataUrl(dataUrl: string): ParsedImageDataUrl | null {
  const match = dataUrl.match(IMAGE_DATA_URL_RE);
  if (!match) return null;
  return { mediaType: `image/${match[1]}` as ImageMediaType, base64: match[2] };
}
