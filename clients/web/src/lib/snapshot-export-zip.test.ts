import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  SNAPSHOT_EXPORT_ZIP_MAX_BYTES,
  SnapshotImportError,
  type SnapshotExportFileMap,
} from "@dodi/protocol/snapshot-export";

import { packSnapshotExportZip, unpackSnapshotExportZip } from "./snapshot-export-zip";

const enc = (s: string) => new TextEncoder().encode(s);

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe("pack → unpack", () => {
  it("round-trips contract files byte-for-byte", async () => {
    const files: SnapshotExportFileMap = {
      "manifest.json": enc('{"formatVersion":1}'),
      "game.html": enc("<html>game</html>"),
      "saved-state.json": enc('{"level":3}'),
      "assets/thumbnail.png": new Uint8Array([137, 80, 78, 71, 0, 255]),
      "game.md": enc("# doc"),
    };
    const unpacked = unpackSnapshotExportZip(
      await blobBytes(packSnapshotExportZip(files)),
    );
    expect(Object.keys(unpacked).sort()).toEqual(Object.keys(files).sort());
    for (const [name, bytes] of Object.entries(files)) {
      expect(Array.from(unpacked[name])).toEqual(Array.from(bytes));
    }
  });
});

describe("hostile input", () => {
  it("rejects oversized bytes before inflating", () => {
    const huge = new Uint8Array(SNAPSHOT_EXPORT_ZIP_MAX_BYTES + 1);
    try {
      unpackSnapshotExportZip(huge);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SnapshotImportError);
      expect((error as SnapshotImportError).code).toBe("archive-too-large");
    }
  });

  it("rejects bytes that are not a zip", () => {
    try {
      unpackSnapshotExportZip(enc("definitely not a zip"));
      expect.unreachable();
    } catch (error) {
      expect((error as SnapshotImportError).code).toBe("archive-invalid");
    }
  });

  it("ignores unknown and path-traversal entries", () => {
    const zipped = zipSync({
      "manifest.json": enc("{}"),
      "extra.txt": enc("sneaky"),
      "../evil.html": enc("<script>"),
      "assets/other.png": enc("x"),
    });
    const unpacked = unpackSnapshotExportZip(zipped);
    expect(Object.keys(unpacked)).toEqual(["manifest.json"]);
  });

  it("drops entries whose inflated size exceeds the per-entry budget", () => {
    const zipped = zipSync({
      "manifest.json": enc("{}"),
      "game.md": new Uint8Array(5 * 1024 * 1024), // zeros compress well, inflate big
    });
    const unpacked = unpackSnapshotExportZip(zipped);
    expect(Object.keys(unpacked)).toEqual(["manifest.json"]);
  });
});
