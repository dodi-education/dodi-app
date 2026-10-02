/**
 * Browser adapters for `.dodi-game.zip` archives. Packing/unpacking itself is
 * `@dodi/games/export-zip` (bytes in, bytes out, shared with the mobile app);
 * this module only wraps the bytes in a Blob and triggers the download.
 */

/** The zip bytes as a downloadable Blob. */
export function zipBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/zip" });
}

/** Trigger a browser download for a client-built blob (persona-export pattern). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
