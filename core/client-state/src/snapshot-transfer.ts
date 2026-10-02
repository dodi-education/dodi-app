/**
 * Export and import of `.dodi-snap.zip` archives, entirely on the device: the
 * server never sees an archive (mirrors `./game-transfer`).
 *
 * The archive contract (file names, manifest schema, validation) lives in
 * `@dodi/protocol/snapshot-export`; this module zips/unzips it (fflate, pure
 * JS: browser and React Native alike), decrypts a snapshot for export and
 * re-seals an imported one under THIS account's vault. Bytes in, bytes out:
 * each client adapts its own download / share sheet and file picker.
 */
import {
  SNAPSHOT_EXPORT_ENTRY_MAX_BYTES,
  SNAPSHOT_EXPORT_TOTAL_MAX_BYTES,
  SNAPSHOT_EXPORT_ZIP_MAX_BYTES,
  type ParsedSnapshotExport,
  type SnapshotExportFileMap,
  type SnapshotImportErrorCode,
  SnapshotImportError,
  buildSnapshotExportFiles,
  isSnapshotExportEntryPath,
  matchKidByName,
  parseSnapshotExportFiles,
  snapshotExportFileName,
} from "@dodi/protocol/snapshot-export";
import type { Kid } from "@dodi/types/database";
import type { VaultSession } from "@dodi/vault";
import { unzipSync, zipSync } from "fflate";

import {
  type AccountSnapshot,
  type SnapshotDeps,
  createOwnSnapshot,
  fetchSnapshot,
  openSnapshotPayload,
  sealOwnSnapshot,
} from "./snapshots";

/** Zip a snapshot export file map. */
export function packSnapshotExportZip(files: SnapshotExportFileMap): Uint8Array {
  return zipSync(files);
}

/**
 * Unzip an untrusted archive. The byte budget is checked before inflating,
 * and only contract paths under the per-entry and total budgets are admitted
 * (zip-bomb / path-traversal guard). Throws {@link SnapshotImportError}.
 */
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
    throw new SnapshotImportError("archive-invalid", "The file is not a valid snapshot archive");
  }
  return entries;
}

/**
 * Build the export archive for one row of the parent overview: the heavy
 * payload is fetched and decrypted here (own/autosave rows under the vault,
 * received rows via the owning kid's friend keys). The archive records the
 * kid's name so an import elsewhere can suggest the matching kid. Rejects
 * when the row's info is unreadable or the payload can't be opened.
 */
export async function buildSnapshotExportArchive(
  deps: SnapshotDeps,
  input: {
    snapshot: AccountSnapshot;
    /** The owning kid (decrypted): needed to open received rows. */
    kid: Kid | null;
    session: VaultSession;
    appVersion: string;
  },
): Promise<{ bytes: Uint8Array; fileName: string }> {
  const { snapshot, kid, session, appVersion } = input;
  if (!snapshot.info) throw new Error("");
  const detail = await fetchSnapshot(deps, snapshot.view.id);
  const { payload, sanitizedCode } = await openSnapshotPayload(deps, detail, kid, session);
  const files = buildSnapshotExportFiles({
    info: snapshot.info,
    payload: { ...payload, codeBundle: sanitizedCode },
    kidName: snapshot.kidName,
    appVersion,
  });
  return { bytes: packSnapshotExportZip(files), fileName: snapshotExportFileName(payload.title) };
}

/** Unzip + validate + sanitize an archive (throws {@link SnapshotImportError}). */
export function parseSnapshotImportArchive(bytes: Uint8Array): ParsedSnapshotExport {
  return parseSnapshotExportFiles(unpackSnapshotExportZip(bytes));
}

/** `parentSnapshots` message key for each structured import-error code. */
const IMPORT_ERROR_KEY_BY_CODE: Record<SnapshotImportErrorCode, string> = {
  "archive-too-large": "importErrArchiveTooLarge",
  "archive-invalid": "importErrArchiveInvalid",
  "manifest-missing": "importErrManifest",
  "manifest-invalid": "importErrManifest",
  "unsupported-version": "importErrVersion",
  "code-missing": "importErrCode",
  "unsafe-code": "importErrUnsafeCode",
  "state-missing": "importErrState",
  "state-invalid": "importErrState",
  "payload-invalid": "importErrPayload",
};

/** The `parentSnapshots` message key for a failed parse. */
export function snapshotImportErrorKey(error: unknown): string {
  return error instanceof SnapshotImportError
    ? IMPORT_ERROR_KEY_BY_CODE[error.code]
    : "importErrArchiveInvalid";
}

/** Preselect the same-named kid; a single-kid account needs no choosing. */
export function suggestImportKidId(
  parsed: ParsedSnapshotExport,
  kidOptions: { id: string; name: string }[],
): string | null {
  return (
    matchKidByName(parsed.manifest.kidName, kidOptions) ??
    (kidOptions.length === 1 ? kidOptions[0].id : null)
  );
}

/**
 * Store a parsed archive as an own snapshot of `kidId`. The archive is hostile
 * input, already validated + sanitized by the parse; seal here: once it is
 * ciphertext no later layer can check it. Works across accounts by design.
 */
export async function importSnapshot(
  deps: Pick<SnapshotDeps, "api">,
  input: { parsed: ParsedSnapshotExport; kidId: string; session: VaultSession },
): Promise<void> {
  const { parsed, kidId, session } = input;
  await createOwnSnapshot(deps, {
    kidId,
    // The soft game reference never crosses accounts; the payload is
    // self-contained, so the snapshot plays without the source game.
    gameId: null,
    ...sealOwnSnapshot(session, { info: parsed.info, payload: parsed.payload }),
  });
}
