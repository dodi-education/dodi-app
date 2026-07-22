/**
 * Browser-side raster utilities: downscale a capture/upload into a bounded JPEG
 * data URL. Used for snapshot-gallery thumbnails (tiny, keeps every gallery
 * decrypt cheap), studio reference-image attachments, edit-time screenshots
 * (bounded before they hit provider requests + the sealed transcript), and the
 * square 100×100 game-list preview (`preview_image`).
 */

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("thumbnail image failed to load"));
    img.src = dataUrl;
  });
}

export interface DownscaleOptions {
  maxWidth?: number;
  maxHeight?: number;
  /** JPEG quality 0..1. */
  quality?: number;
}

export async function downscaleDataUrl(
  dataUrl: string,
  options: DownscaleOptions = {},
): Promise<string | null> {
  const { maxWidth = 240, maxHeight = 300, quality = 0.7 } = options;
  try {
    const img = await loadImage(dataUrl);
    if (img.width < 1 || img.height < 1) return null;
    const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // JPEG has no alpha — transparent captures need a white base.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}

/**
 * Center-crop the largest square out of a capture and downscale it to a
 * `size`×`size` JPEG data URL — the game-list preview shape. The square crop
 * keeps as much of the game surface as fits from a centered point of view
 * (the 4:5 stage loses only its top/bottom edges).
 */
export async function squareThumbnailDataUrl(
  dataUrl: string,
  size: number,
  quality = 0.8,
): Promise<string | null> {
  try {
    const img = await loadImage(dataUrl);
    const side = Math.min(img.width, img.height);
    if (side < 1) return null;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // JPEG has no alpha — transparent captures need a white base.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(
      img,
      (img.width - side) / 2,
      (img.height - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}

/** Read a picked/pasted file into a data URL. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("file could not be read"));
    reader.readAsDataURL(file);
  });
}

/** Append incoming attachments to the existing set, bounded to `max`. */
export function capImages(existing: string[], incoming: string[], max: number): string[] {
  return [...existing, ...incoming].slice(0, max);
}
