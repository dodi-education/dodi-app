/**
 * Persona `.soul.md` files on the device: the app's stand-ins for the web's
 * file input (import) and download link (export). The soul is plaintext only
 * here, on the device; it is sealed before it reaches the server.
 */
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

const MARKDOWN_MIME = "text/markdown";

/** Let the parent pick a markdown file; its name and text, or null when they cancel. */
export async function pickSoulFile(): Promise<{ name: string; text: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    // Markdown has no reliable MIME type across providers; accept text files.
    type: [MARKDOWN_MIME, "text/x-markdown", "text/plain", "application/octet-stream"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  return { name: asset.name, text: await new File(asset.uri).text() };
}

/**
 * Write the soul to the cache directory and open the OS share sheet (save to
 * Files, mail …). Resolves once the sheet closes.
 */
export async function shareSoulFile(soul: string, fileName: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is not available on this device");
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(soul);
  await Sharing.shareAsync(file.uri, { mimeType: MARKDOWN_MIME, UTI: "net.daringfireball.markdown" });
}
