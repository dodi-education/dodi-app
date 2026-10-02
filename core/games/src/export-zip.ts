/**
 * Zip packing/unpacking for `.dodi-game.zip` archives (fflate, pure JS, so it
 * runs in the browser and in React Native alike).
 *
 * The archive contract itself (file names, manifest schema, validation) lives
 * in ./export; this module only turns a file map into zip bytes and back,
 * entirely client-side (the server never sees an archive, mirroring the
 * persona export). Bytes in, bytes out: each client adapts its own File/Blob.
 * Unpacking treats the zip as hostile: the byte budget is checked before
 * inflating, and only contract paths under the per-entry and total budgets are
 * admitted (zip-bomb / path-traversal guard).
 */
import { unzipSync, zipSync } from "fflate";

import {
  GAME_EXPORT_ENTRY_MAX_BYTES,
  GAME_EXPORT_TOTAL_MAX_BYTES,
  GAME_EXPORT_ZIP_MAX_BYTES,
  type GameExportFileMap,
  GameImportError,
  isGameExportEntryPath,
} from "./export";

/** Zip a game export file map. */
export function packGameExportZip(files: GameExportFileMap): Uint8Array {
  return zipSync(files);
}

/** Unzip an untrusted archive into its contract entries (throws {@link GameImportError}). */
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
