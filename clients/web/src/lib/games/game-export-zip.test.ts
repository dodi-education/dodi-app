import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  GAME_EXPORT_ZIP_MAX_BYTES,
  GameImportError,
  type GameExportFileMap,
} from "@dodi/games/export";

import { packGameExportZip, unpackGameExportZip } from "./game-export-zip";

const enc = (s: string) => new TextEncoder().encode(s);

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe("pack → unpack", () => {
  it("round-trips contract files byte-for-byte", async () => {
    const files: GameExportFileMap = {
      "manifest.json": enc('{"formatVersion":1}'),
      "game.html": enc("<html>game</html>"),
      "assets/background.png": new Uint8Array([137, 80, 78, 71, 0, 255]),
      "game.md": enc("# doc"),
    };
    const unpacked = unpackGameExportZip(await blobBytes(packGameExportZip(files)));
    expect(Object.keys(unpacked).sort()).toEqual(Object.keys(files).sort());
    for (const [name, bytes] of Object.entries(files)) {
      expect(Array.from(unpacked[name])).toEqual(Array.from(bytes));
    }
  });
});

describe("hostile input", () => {
  it("rejects oversized bytes before inflating", () => {
    const huge = new Uint8Array(GAME_EXPORT_ZIP_MAX_BYTES + 1);
    try {
      unpackGameExportZip(huge);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(GameImportError);
      expect((error as GameImportError).code).toBe("archive-too-large");
    }
  });

  it("rejects bytes that are not a zip", () => {
    try {
      unpackGameExportZip(enc("definitely not a zip"));
      expect.unreachable();
    } catch (error) {
      expect((error as GameImportError).code).toBe("archive-invalid");
    }
  });

  it("ignores unknown and path-traversal entries", () => {
    const zipped = zipSync({
      "manifest.json": enc("{}"),
      "extra.txt": enc("sneaky"),
      "../evil.html": enc("<script>"),
      "assets/other.png": enc("x"),
    });
    const unpacked = unpackGameExportZip(zipped);
    expect(Object.keys(unpacked)).toEqual(["manifest.json"]);
  });

  it("drops entries whose inflated size exceeds the per-entry budget", () => {
    const zipped = zipSync({
      "manifest.json": enc("{}"),
      "game.md": new Uint8Array(9 * 1024 * 1024), // zeros compress well, inflate big
    });
    const unpacked = unpackGameExportZip(zipped);
    expect(Object.keys(unpacked)).toEqual(["manifest.json"]);
  });
});
