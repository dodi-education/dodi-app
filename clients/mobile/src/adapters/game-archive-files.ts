/**
 * `.dodi-game.zip` files on the device: the app's stand-ins for the web's
 * download link (export) and file input (import). The archive bytes are
 * built and parsed in `@dodi/client-state/game-transfer`; this only moves
 * bytes between memory, the cache directory and the OS.
 */
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

const ZIP_MIME = "application/zip";

/**
 * Write the archive to the cache directory and open the OS share sheet (save
 * to Files, AirDrop, mail …). Resolves once the sheet closes.
 */
export async function shareGameArchive(bytes: Uint8Array, fileName: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is not available on this device");
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  await Sharing.shareAsync(file.uri, { mimeType: ZIP_MIME, UTI: "public.zip-archive" });
}

/** Let the parent pick an archive; its bytes, or null when they cancel. */
export async function pickGameArchive(): Promise<Uint8Array | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [ZIP_MIME, "application/x-zip-compressed", "application/octet-stream"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  return new File(asset.uri).bytes();
}
