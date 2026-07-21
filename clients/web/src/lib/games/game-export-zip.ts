/**
 * Zip packing/unpacking for `.dodi-game.zip` archives (fflate).
 *
 * The archive contract itself (file names, manifest schema, validation) lives
 * in @dodi/games/export — this module only turns a file map into zip bytes and
 * back, entirely client-side (the server never sees an archive, mirroring the
 * persona export). Unpacking treats the zip as hostile: the byte budget is
 * checked before inflating, and only contract paths under the per-entry and
 * total budgets are admitted (zip-bomb / path-traversal guard).
 */
import {
  GAME_EXPORT_ENTRY_MAX_BYTES,
  GAME_EXPORT_TOTAL_MAX_BYTES,
  GAME_EXPORT_ZIP_MAX_BYTES,
  type GameExportFileMap,
  GameImportError,
  isGameExportEntryPath,
} from "@dodi/games/export";
import { unzipSync, zipSync } from "fflate";

export function packGameExportZip(files: GameExportFileMap): Blob {
  const zipped = zipSync(files);
  return new Blob([zipped as Uint8Array<ArrayBuffer>], { type: "application/zip" });
}

export function unpackGameExportZip(bytes: Uint8Array): GameExportFileMap {
  if (bytes.byteLength > GAME_EXPORT_ZIP_MAX_BYTES) {
    throw new GameImportError("archive-too-large", "The file exceeds the size limit");
  }
  let admittedTotal = 0;
  let entries: GameExportFileMap;
  try {
    entries = unzipSync(bytes, {
      filter: (entry) => {
        if (!isGameExportEntryPath(entry.name)) return false;
        if (entry.originalSize > GAME_EXPORT_ENTRY_MAX_BYTES) return false;
        if (admittedTotal + entry.originalSize > GAME_EXPORT_TOTAL_MAX_BYTES) return false;
        admittedTotal += entry.originalSize;
        return true;
      },
    });
  } catch {
    throw new GameImportError("archive-invalid", "The file is not a valid game archive");
  }
  return entries;
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
