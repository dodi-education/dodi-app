/**
 * Reference images for the Game Studio (the web's file input and
 * `capture="environment"` camera input): photos from the camera or the
 * library as data URLs, downscaled with the studio's image ops like the web's
 * `downscaleDataUrl`. Anything unreadable is skipped silently, as on the web.
 */
import * as ImagePicker from "expo-image-picker";
import type { ImageBound } from "@dodi/studio/ports";

import { nativeImageOps } from "@/adapters/image-ops";

function toDataUrl(asset: ImagePicker.ImagePickerAsset): string | null {
  if (!asset.base64) return null;
  const mime = asset.mimeType?.startsWith("image/") ? asset.mimeType : "image/jpeg";
  return `data:${mime};base64,${asset.base64}`;
}

async function downscaleAll(
  assets: ImagePicker.ImagePickerAsset[],
  bound: ImageBound,
): Promise<string[]> {
  const scaled: string[] = [];
  for (const asset of assets) {
    if (asset.type && asset.type !== "image") continue;
    const raw = toDataUrl(asset);
    if (!raw) continue;
    const small = await nativeImageOps.downscale(raw, bound).catch(() => null);
    if (small) scaled.push(small);
  }
  return scaled;
}

/** Take one photo with the camera. Empty when cancelled or not permitted. */
export async function takePhoto(bound: ImageBound): Promise<string[]> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return [];
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    base64: true,
    quality: 0.9,
  });
  if (result.canceled) return [];
  return downscaleAll(result.assets, bound);
}

/** Pick up to `limit` images from the library. Empty when cancelled. */
export async function pickImages(bound: ImageBound, limit: number): Promise<string[]> {
  if (limit < 1) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    base64: true,
    quality: 0.9,
  });
  if (result.canceled) return [];
  return downscaleAll(result.assets, bound);
}
