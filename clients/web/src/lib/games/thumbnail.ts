/**
 * Downscale a game-surface capture (PNG data URL from `get_snapshot`) into a
 * small JPEG thumbnail for the snapshot gallery info blob — keeps every gallery
 * decrypt cheap and the sealed blob far under its size cap.
 */

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("thumbnail image failed to load"));
    img.src = dataUrl;
  });
}

export async function downscaleDataUrl(
  dataUrl: string,
  maxWidth = 240,
  maxHeight = 300,
): Promise<string | null> {
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
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}
