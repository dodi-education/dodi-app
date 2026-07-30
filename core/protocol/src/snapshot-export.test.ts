import { describe, expect, it } from "vitest";

import type { SnapshotInfoV1, SnapshotPayloadV1 } from "@dodi/types/games";

import {
  SNAPSHOT_EXPORT_CODE_FILE,
  SNAPSHOT_EXPORT_MANIFEST_FILE,
  SNAPSHOT_EXPORT_MARKDOWN_FILE,
  SNAPSHOT_EXPORT_STATE_FILE,
  SnapshotImportError,
  type SnapshotExportFileMap,
  buildSnapshotExportFiles,
  isSnapshotExportEntryPath,
  matchKidByName,
  parseSnapshotExportFiles,
  snapshotExportFileName,
} from "./snapshot-export";

const THUMB_DATA_URL = `data:image/png;base64,${btoa("fake-png-bytes")}`;

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

function payload(overrides: Partial<SnapshotPayloadV1> = {}): SnapshotPayloadV1 {
  return {
    v: 1,
    title: "Rocket rescue!",
    createdAt: "2026-07-01T10:00:00.000Z",
    gameId: "8c9e6b0a-3f2d-4d1c-9a5b-7e8f9a0b1c2d",
    gameTitle: "Space Count",
    gameDescription: "Count the rockets before liftoff",
    gameMarkdown: "# Space Count\nA counting game.",
    codeBundle: "<html><body><canvas></canvas></body></html>",
    capabilities: ["saveState"],
    drawingStyle: "picture",
    savedState: { level: 3, stars: ["a", "b"] },
    ...overrides,
  };
}

function info(overrides: Partial<SnapshotInfoV1> = {}): SnapshotInfoV1 {
  return {
    v: 1,
    title: "Rocket rescue!",
    gameTitle: "Space Count",
    thumbnail: THUMB_DATA_URL,
    createdAt: "2026-07-01T10:00:00.000Z",
    ...overrides,
  };
}

function buildFiles(
  p: Partial<SnapshotPayloadV1> = {},
  i: Partial<SnapshotInfoV1> = {},
): SnapshotExportFileMap {
  return buildSnapshotExportFiles({
    info: info(i),
    payload: payload(p),
    kidName: "Emma",
    appVersion: "dodi web",
    now: new Date("2026-07-30T12:00:00.000Z"),
  });
}

describe("buildSnapshotExportFiles", () => {
  it("emits the contract files with the thumbnail as a real asset", () => {
    const files = buildFiles();
    expect(Object.keys(files).sort()).toEqual([
      "assets/thumbnail.png",
      SNAPSHOT_EXPORT_MARKDOWN_FILE,
      SNAPSHOT_EXPORT_CODE_FILE,
      SNAPSHOT_EXPORT_MANIFEST_FILE,
      SNAPSHOT_EXPORT_STATE_FILE,
    ].sort());

    const manifest = JSON.parse(dec(files[SNAPSHOT_EXPORT_MANIFEST_FILE])) as {
      kidName: string;
      thumbnail: { file: string; mimeType: string };
      exportedAt: string;
    };
    expect(manifest.kidName).toBe("Emma");
    expect(manifest.thumbnail).toEqual({
      file: "assets/thumbnail.png",
      mimeType: "image/png",
    });
    expect(manifest.exportedAt).toBe("2026-07-30T12:00:00.000Z");
    expect(dec(files["assets/thumbnail.png"])).toBe("fake-png-bytes");
    expect(dec(files[SNAPSHOT_EXPORT_CODE_FILE])).toContain("<canvas>");
  });

  it("never leaks ids into the manifest", () => {
    const manifest = dec(buildFiles()[SNAPSHOT_EXPORT_MANIFEST_FILE]);
    expect(manifest).not.toContain("8c9e6b0a");
    expect(manifest).not.toContain("gameId");
  });

  it("omits thumbnail and markdown files when absent", () => {
    const files = buildFiles({ gameMarkdown: "  " }, { thumbnail: null });
    expect(Object.keys(files).sort()).toEqual([
      SNAPSHOT_EXPORT_CODE_FILE,
      SNAPSHOT_EXPORT_MANIFEST_FILE,
      SNAPSHOT_EXPORT_STATE_FILE,
    ].sort());
    const manifest = JSON.parse(dec(files[SNAPSHOT_EXPORT_MANIFEST_FILE])) as {
      thumbnail: unknown;
    };
    expect(manifest.thumbnail).toBeNull();
  });

  it("drops a non-raster thumbnail instead of failing", () => {
    const files = buildFiles({}, {
      thumbnail: `data:image/svg+xml;base64,${btoa("<svg/>")}`,
    });
    const manifest = JSON.parse(dec(files[SNAPSHOT_EXPORT_MANIFEST_FILE])) as {
      thumbnail: unknown;
    };
    expect(manifest.thumbnail).toBeNull();
    expect(Object.keys(files).some((f) => f.startsWith("assets/"))).toBe(false);
  });
});

describe("parseSnapshotExportFiles", () => {
  it("round-trips build output into sealed-row-ready info + payload", () => {
    const parsed = parseSnapshotExportFiles(buildFiles());
    expect(parsed.manifest.kidName).toBe("Emma");
    expect(parsed.payload).toEqual({
      ...payload(),
      // The soft game reference never crosses accounts.
      gameId: null,
    });
    expect(parsed.info).toEqual(info());
    expect(parsed.warnings).toEqual([]);
  });

  const expectCode = (files: SnapshotExportFileMap, code: string) => {
    try {
      parseSnapshotExportFiles(files);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SnapshotImportError);
      expect((error as SnapshotImportError).code).toBe(code);
    }
  };

  it("rejects a missing manifest", () => {
    const files = buildFiles();
    delete files[SNAPSHOT_EXPORT_MANIFEST_FILE];
    expectCode(files, "manifest-missing");
  });

  it("rejects an unknown format version", () => {
    const files = buildFiles();
    files[SNAPSHOT_EXPORT_MANIFEST_FILE] = enc('{"formatVersion":99}');
    expectCode(files, "unsupported-version");
  });

  it("rejects a manifest that fails validation", () => {
    const files = buildFiles();
    const manifest = JSON.parse(dec(files[SNAPSHOT_EXPORT_MANIFEST_FILE])) as {
      kidName: string;
    };
    manifest.kidName = "";
    files[SNAPSHOT_EXPORT_MANIFEST_FILE] = enc(JSON.stringify(manifest));
    expectCode(files, "manifest-invalid");
  });

  it("rejects missing game code and missing save state", () => {
    const noCode = buildFiles();
    delete noCode[SNAPSHOT_EXPORT_CODE_FILE];
    expectCode(noCode, "code-missing");

    const noState = buildFiles();
    delete noState[SNAPSHOT_EXPORT_STATE_FILE];
    expectCode(noState, "state-missing");
  });

  it("rejects unsafe game code (network access)", () => {
    const files = buildFiles();
    files[SNAPSHOT_EXPORT_CODE_FILE] = enc(
      "<html><script>fetch('https://evil.example')</script></html>",
    );
    expectCode(files, "unsafe-code");
  });

  it("rejects a save state that is not a JSON object", () => {
    const files = buildFiles();
    files[SNAPSHOT_EXPORT_STATE_FILE] = enc("[1,2,3]");
    expectCode(files, "state-invalid");
  });

  it("rejects payload fields smuggled past the manifest caps", () => {
    const files = buildFiles();
    // savedState within the entry budget but over the payload schema cap.
    files[SNAPSHOT_EXPORT_STATE_FILE] = enc(
      JSON.stringify({ blob: "x".repeat(1_600_000) }),
    );
    expectCode(files, "payload-invalid");
  });

  it("degrades a missing thumbnail asset to a warning", () => {
    const files = buildFiles();
    delete files["assets/thumbnail.png"];
    const parsed = parseSnapshotExportFiles(files);
    expect(parsed.info.thumbnail).toBeNull();
    expect(parsed.warnings).toHaveLength(1);
  });

  it("truncates an oversized design doc with a warning", () => {
    const files = buildFiles();
    files[SNAPSHOT_EXPORT_MARKDOWN_FILE] = enc("m".repeat(60_000));
    const parsed = parseSnapshotExportFiles(files);
    expect(parsed.payload.gameMarkdown).toHaveLength(50_000);
    expect(parsed.warnings).toHaveLength(1);
  });
});

describe("archive contract helpers", () => {
  it("isSnapshotExportEntryPath admits only contract paths", () => {
    expect(isSnapshotExportEntryPath("manifest.json")).toBe(true);
    expect(isSnapshotExportEntryPath("game.html")).toBe(true);
    expect(isSnapshotExportEntryPath("saved-state.json")).toBe(true);
    expect(isSnapshotExportEntryPath("game.md")).toBe(true);
    expect(isSnapshotExportEntryPath("assets/thumbnail.webp")).toBe(true);
    expect(isSnapshotExportEntryPath("assets/thumbnail.svg")).toBe(false);
    expect(isSnapshotExportEntryPath("../evil.html")).toBe(false);
    expect(isSnapshotExportEntryPath("extra.txt")).toBe(false);
  });

  it("slugs the download filename", () => {
    expect(snapshotExportFileName("Rocket rescue!")).toBe(
      "rocket-rescue.dodi-snap.zip",
    );
    expect(snapshotExportFileName("Überflieger — Léa")).toBe(
      "uberflieger-lea.dodi-snap.zip",
    );
    expect(snapshotExportFileName("!!!")).toBe("snapshot.dodi-snap.zip");
  });
});

describe("matchKidByName", () => {
  const kids = [
    { id: "kid-1", name: "Emma" },
    { id: "kid-2", name: "Léon" },
    { id: "kid-3", name: "emma " },
  ];

  it("matches case-insensitively with trimming", () => {
    expect(matchKidByName("léon", kids)).toBe("kid-2");
    expect(matchKidByName("  Léon ", kids)).toBe("kid-2");
  });

  it("returns null when no kid matches", () => {
    expect(matchKidByName("Mia", kids)).toBeNull();
    expect(matchKidByName("", kids)).toBeNull();
  });

  it("returns null when two kids share the name (parent decides)", () => {
    expect(matchKidByName("Emma", kids)).toBeNull();
  });
});
