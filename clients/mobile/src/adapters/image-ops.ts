/**
 * Raster work for the Game Studio (`ImageOps` of `@dodi/studio`), the native
 * counterpart of the web's canvas helpers in `lib/games/thumbnail.ts`: bound a
 * capture or upload into a JPEG data URL, or center-crop the square game-list
 * preview. Same geometry as the web (scale down only, never up).
 *
 * The manipulator reads files, so a data URL is written to a cache file first
 * and removed afterwards. Unlike the canvas there is no white base under a
 * transparent PNG; captures and generated images are opaque in practice.
 */
import { File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { ImageOps } from "@dodi/studio/ports";

const DATA_URL = /^data:image\/([a-z+]+);base64,(.*)$/s;

async function withImageFile<T>(dataUrl: string, read: (uri: string) => Promise<T>): Promise<T | null> {
  const match = DATA_URL.exec(dataUrl);
  if (!match) return null;
  const extension = match[1] === "jpeg" ? "jpg" : match[1].replace("+xml", "");
  const file = new File(Paths.cache, `studio-image-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`);
  try {
    file.create();
    file.write(match[2], { encoding: "base64" });
    return await read(file.uri);
  } catch {
    return null;
  } finally {
    try {
      if (file.exists) file.delete();
    } catch {
      // The cache directory is purged by the OS anyway.
    }
  }
}

async function toJpegDataUrl(
  uri: string,
  edit: (size: { width: number; height: number }) => {
    crop?: { originX: number; originY: number; width: number; height: number };
    resize?: { width: number; height: number };
  },
  quality: number,
): Promise<string | null> {
  const source = await ImageManipulator.manipulate(uri).renderAsync();
  if (source.width < 1 || source.height < 1) return null;
  const { crop, resize } = edit({ width: source.width, height: source.height });
  const context = ImageManipulator.manipulate(uri);
  if (crop) context.crop(crop);
  if (resize) context.resize(resize);
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: quality, base64: true });
  return saved.base64 ? `data:image/jpeg;base64,${saved.base64}` : null;
}

export const nativeImageOps: ImageOps = {
  downscale: (dataUrl, { maxWidth, maxHeight, quality }) =>
    withImageFile(dataUrl, (uri) =>
      toJpegDataUrl(
        uri,
        ({ width, height }) => {
          const scale = Math.min(1, maxWidth / width, maxHeight / height);
          return scale < 1
            ? {
                resize: {
                  width: Math.max(1, Math.round(width * scale)),
                  height: Math.max(1, Math.round(height * scale)),
                },
              }
            : {};
        },
        quality,
      ),
    ),
  squareThumbnail: (dataUrl, size) =>
    withImageFile(dataUrl, (uri) =>
      toJpegDataUrl(
        uri,
        ({ width, height }) => {
          const side = Math.min(width, height);
          return {
            crop: {
              originX: Math.floor((width - side) / 2),
              originY: Math.floor((height - side) / 2),
              width: side,
              height: side,
            },
            resize: { width: size, height: size },
          };
        },
        0.8,
      ),
    ),
};
