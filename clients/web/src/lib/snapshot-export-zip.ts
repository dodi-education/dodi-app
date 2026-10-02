/**
 * Browser wrapper over the shared `.dodi-snap.zip` packing
 * (`@dodi/client-state/snapshot-transfer`, fflate): packing yields a Blob for
 * the download link; unpacking (hostile input, zip-bomb / path guards) is the
 * shared implementation unchanged.
 */
import type { SnapshotExportFileMap } from "@dodi/protocol/snapshot-export";
import { packSnapshotExportZip as packBytes } from "@dodi/client-state/snapshot-transfer";

export { unpackSnapshotExportZip } from "@dodi/client-state/snapshot-transfer";

export function packSnapshotExportZip(files: SnapshotExportFileMap): Blob {
  return new Blob([packBytes(files) as Uint8Array<ArrayBuffer>], { type: "application/zip" });
}
