/**
 * Zip packing/unpacking for `.dodi-snap.zip` archives (fflate).
 *
 * The archive contract itself (file names, manifest schema, validation) lives
 * in @dodi/protocol/snapshot-export — this module only turns a file map into
 * zip bytes and back, entirely client-side (the server never sees an archive,
 * mirroring the game export). Unpacking treats the zip as hostile: the byte
 * budget is checked before inflating, and only contract paths under the
 * per-entry and total budgets are admitted (zip-bomb / path-traversal guard).
 */
import {
  SNAPSHOT_EXPORT_ENTRY_MAX_BYTES,
  SNAPSHOT_EXPORT_TOTAL_MAX_BYTES,
  SNAPSHOT_EXPORT_ZIP_MAX_BYTES,
  type SnapshotExportFileMap,
  SnapshotImportError,
  isSnapshotExportEntryPath,
} from "@dodi/protocol/snapshot-export";
import { unzipSync, zipSync } from "fflate";

export function packSnapshotExportZip(files: SnapshotExportFileMap): Blob {
  const zipped = zipSync(files);
  return new Blob([zipped as Uint8Array<ArrayBuffer>], { type: "application/zip" });
}

export function unpackSnapshotExportZip(bytes: Uint8Array): SnapshotExportFileMap {
  if (bytes.byteLength > SNAPSHOT_EXPORT_ZIP_MAX_BYTES) {
    throw new SnapshotImportError("archive-too-large", "The file exceeds the size limit");
  }
  let admittedTotal = 0;
  let entries: SnapshotExportFileMap;
  try {
    entries = unzipSync(bytes, {
      filter: (entry) => {
        if (!isSnapshotExportEntryPath(entry.name)) return false;
        if (entry.originalSize > SNAPSHOT_EXPORT_ENTRY_MAX_BYTES) return false;
        if (admittedTotal + entry.originalSize > SNAPSHOT_EXPORT_TOTAL_MAX_BYTES) {
          return false;
        }
        admittedTotal += entry.originalSize;
        return true;
      },
    });
  } catch {
    throw new SnapshotImportError(
      "archive-invalid",
      "The file is not a valid snapshot archive",
    );
  }
  return entries;
}
