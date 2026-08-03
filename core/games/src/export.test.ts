import { describe, expect, it } from "vitest";

import {
  GAME_EXPORT_CODE_FILE,
  GAME_EXPORT_MANIFEST_FILE,
  GAME_EXPORT_MARKDOWN_FILE,
  GAME_EXPORT_TRANSCRIPT_FILE,
  GameImportError,
  type ExportableGame,
  type GameExportFileMap,
  buildGameExportFiles,
  bytesToDataUrl,
  dataUrlToBytes,
  extensionForMimeType,
  gameExportFileName,
  isGameExportEntryPath,
  parseGameExportFiles,
} from "./export";
import { BACKGROUND_IMAGE_PLACEHOLDER } from "./background-image";
import { UNBUILT_GAME_PLACEHOLDER } from "./placeholder";

const BG_DATA_URL = `data:image/png;base64,${btoa("fake-png-bytes")}`;
const PREVIEW_DATA_URL = `data:image/jpeg;base64,${btoa("fake-jpeg-bytes")}`;

// Minimal bridge-compliant bundle (mirrors agent-validator.test.ts) with the
// background style block carrying an inline data URL, as stored bundles do.
function builtBundle(backgroundValue: string = BG_DATA_URL): string {
  return `<!doctype html><html><body><style id="background-image">:root{--background-image:url("${backgroundValue}")}</style><script>
    window.addEventListener('message', function (e) {
      var m = e.data;
      if (m.type === 'dodi:init') { parent.postMessage({ type: 'game:ready', payload: { capabilities: [] } }, '*'); }
      if (m.type === 'dodi:command') { parent.postMessage({ type: 'game:result' }, '*'); }
    });
  </script></body></html>`;
}

function gameRow(overrides: Partial<ExportableGame> = {}): ExportableGame {
  return {
    title: "Space Count",
    description: "Count the rockets before liftoff",
    tags: ["math", "numbers"],
    learning_goal: "Counting to ten",
    success_definition: "",
    success_criteria: {},
    progress_kind: "open",
    target_age_min: 4,
    target_age_max: 8,
    estimated_duration_minutes: 10,
    code_bundle: builtBundle(),
    markdown: "# Space Count\nA counting game.",
    metadata: { capabilities: [], drawingStyle: "picture", perspective: "side" },
    preview_image: null,
    ...overrides,
  };
}

function decode(files: GameExportFileMap, name: string): string {
  return new TextDecoder().decode(files[name]);
}

function manifestOf(files: GameExportFileMap): Record<string, unknown> {
  return JSON.parse(decode(files, GAME_EXPORT_MANIFEST_FILE)) as Record<string, unknown>;
}

describe("buildGameExportFiles", () => {
  it("extracts the background: game.html keeps the placeholder, asset carries the bytes", () => {
    const files = buildGameExportFiles({ game: gameRow() });
    const html = decode(files, GAME_EXPORT_CODE_FILE);
    expect(html).toContain(BACKGROUND_IMAGE_PLACEHOLDER);
    expect(html).not.toContain("base64");
    expect(files["assets/background.png"]).toBeDefined();
    expect(new TextDecoder().decode(files["assets/background.png"])).toBe("fake-png-bytes");
    expect(manifestOf(files).background).toEqual({
      file: "assets/background.png",
      mimeType: "image/png",
    });
  });

  it("keeps an unextractable background inline and reports none in the manifest", () => {
    const game = gameRow({ code_bundle: builtBundle("data:image/x-weird;base64,QUJD") });
    const files = buildGameExportFiles({ game });
    expect(decode(files, GAME_EXPORT_CODE_FILE)).toContain("data:image/x-weird");
    expect(manifestOf(files).background).toBeNull();
    expect(Object.keys(files).some((f) => f.startsWith("assets/"))).toBe(false);
  });

  it("omits game.md when the markdown is empty", () => {
    const files = buildGameExportFiles({ game: gameRow({ markdown: "  " }) });
    expect(files[GAME_EXPORT_MARKDOWN_FILE]).toBeUndefined();
  });

  it("includes a validated transcript and flags it in the manifest", () => {
    const transcript = [{ role: "user", text: "make it harder" }];
    const files = buildGameExportFiles({ game: gameRow(), transcript });
    expect(JSON.parse(decode(files, GAME_EXPORT_TRANSCRIPT_FILE))).toEqual(transcript);
    expect(manifestOf(files).hasTranscript).toBe(true);
  });

  it("rejects an invalid transcript instead of exporting it", () => {
    expect(() =>
      buildGameExportFiles({ game: gameRow(), transcript: [{ role: "robot", text: "x" }] }),
    ).toThrow();
  });

  it("treats null metadata values (studio 'unspecified' perspective) as absent", () => {
    const game = gameRow({
      metadata: { capabilities: [], perspective: null, generateBackgroundImage: false },
    });
    const manifest = manifestOf(buildGameExportFiles({ game }));
    expect(manifest.metadata).toEqual({ capabilities: [], generateBackgroundImage: false });
  });

  it("strips unknown metadata keys via the whitelist", () => {
    const game = gameRow({
      metadata: { perspective: "bird", secretInternal: "leak-me" },
    });
    const manifest = manifestOf(buildGameExportFiles({ game }));
    expect(manifest.metadata).toEqual({ perspective: "bird" });
  });

  it("stamps exportedAt and the app version", () => {
    const files = buildGameExportFiles({
      game: gameRow(),
      appVersion: "dodi-web test",
      now: new Date("2026-07-20T12:00:00Z"),
    });
    const manifest = manifestOf(files);
    expect(manifest.exportedAt).toBe("2026-07-20T12:00:00.000Z");
    expect(manifest.app).toBe("dodi-web test");
  });

  it("carries the preview image as an asset + manifest entry", () => {
    const files = buildGameExportFiles({ game: gameRow({ preview_image: PREVIEW_DATA_URL }) });
    expect(isGameExportEntryPath("assets/preview.jpg")).toBe(true);
    expect(new TextDecoder().decode(files["assets/preview.jpg"])).toBe("fake-jpeg-bytes");
    expect(manifestOf(files).preview).toEqual({
      file: "assets/preview.jpg",
      mimeType: "image/jpeg",
    });
  });

  it("drops a non-raster preview instead of exporting it", () => {
    const files = buildGameExportFiles({
      game: gameRow({ preview_image: "data:image/svg+xml;base64,QUJD" }),
    });
    expect(manifestOf(files).preview).toBeUndefined();
    expect(Object.keys(files).some((f) => f.startsWith("assets/preview"))).toBe(false);
  });
});

describe("round-trip", () => {
  it("build → parse preserves every field and reproduces the stored bundle", () => {
    const game = gameRow({
      success_definition: "Solve 5 tasks",
      success_criteria: {
        description: "Solve 5 tasks",
        match: "all",
        conditions: [{ metric: "correct", op: ">=", value: 5 }],
        requiredMetrics: ["correct"],
      },
      progress_kind: "goal",
      code_bundle: builtBundle().replace(
        "game:result",
        "game:result game:progress progressKind",
      ),
    });
    const transcript = [{ role: "assistant", text: "built it!" }];
    const parsed = parseGameExportFiles(buildGameExportFiles({ game, transcript }));

    expect(parsed.codeBundle).toBe(game.code_bundle);
    expect(parsed.unbuilt).toBe(false);
    expect(parsed.manifest.title).toBe(game.title);
    expect(parsed.manifest.description).toBe(game.description);
    expect(parsed.tags).toEqual(game.tags);
    expect(parsed.droppedTags).toEqual([]);
    expect(parsed.manifest.learningGoal).toBe(game.learning_goal);
    expect(parsed.manifest.successDefinition).toBe(game.success_definition);
    expect(parsed.manifest.successCriteria).toEqual(game.success_criteria);
    expect(parsed.manifest.progressKind).toBe("goal");
    expect(parsed.manifest.targetAgeMin).toBe(game.target_age_min);
    expect(parsed.manifest.targetAgeMax).toBe(game.target_age_max);
    expect(parsed.manifest.estimatedDurationMinutes).toBe(game.estimated_duration_minutes);
    expect(parsed.manifest.metadata).toEqual(game.metadata);
    expect(parsed.markdown).toBe(game.markdown);
    expect(parsed.transcript).toEqual(transcript);
    expect(parsed.backgroundDataUrl).toBe(BG_DATA_URL);
    expect(parsed.warnings).toEqual([]);
  });

  it("round-trips an unbuilt draft without code validation", () => {
    const game = gameRow({ code_bundle: UNBUILT_GAME_PLACEHOLDER, markdown: "" });
    const parsed = parseGameExportFiles(buildGameExportFiles({ game }));
    expect(parsed.unbuilt).toBe(true);
    expect(parsed.codeBundle).toBe("");
  });

  it("round-trips a bundle with an embedded translations block byte-identically", () => {
    const block =
      '<script type="application/dodi-translations">{"sourceLocale":"de","locales":{"de":{"game.title":"Raketen"},"en":{"game.title":"Rockets"}}}</script>' +
      "<script>document.title = dodi.translate('game.title');</script>";
    const game = gameRow({ code_bundle: builtBundle().replace("<body>", "<body>" + block) });
    const parsed = parseGameExportFiles(buildGameExportFiles({ game }));
    expect(parsed.codeBundle).toBe(game.code_bundle);
    expect(parsed.warnings).toEqual([]);
  });

  it("still imports a legacy archive whose bundle has no translations block", () => {
    // gameRow()'s builtBundle carries no block — the import path must not
    // require one (requireTranslations is an agent-loop-only option).
    const parsed = parseGameExportFiles(buildGameExportFiles({ game: gameRow() }));
    expect(parsed.codeBundle).toBe(gameRow().code_bundle);
  });

  it("round-trips the preview image", () => {
    const files = buildGameExportFiles({ game: gameRow({ preview_image: PREVIEW_DATA_URL }) });
    const parsed = parseGameExportFiles(files);
    expect(parsed.previewImageDataUrl).toBe(PREVIEW_DATA_URL);
    expect(parsed.warnings).toEqual([]);
  });

  it("parses archives from before previews with a null thumbnail", () => {
    const parsed = parseGameExportFiles(buildGameExportFiles({ game: gameRow() }));
    expect(parsed.previewImageDataUrl).toBeNull();
    expect(parsed.warnings).toEqual([]);
  });

  it("degrades a missing preview asset to a warning, not a failed import", () => {
    const files = buildGameExportFiles({ game: gameRow({ preview_image: PREVIEW_DATA_URL }) });
    delete files["assets/preview.jpg"];
    const parsed = parseGameExportFiles(files);
    expect(parsed.previewImageDataUrl).toBeNull();
    expect(parsed.warnings.some((w) => w.includes("assets/preview.jpg"))).toBe(true);
  });
});

function archive(overrides: Partial<Record<string, Uint8Array | null>> = {}): GameExportFileMap {
  const files = buildGameExportFiles({ game: gameRow() });
  for (const [name, value] of Object.entries(overrides)) {
    if (value == null) delete files[name];
    else files[name] = value;
  }
  return files;
}

const enc = (s: string) => new TextEncoder().encode(s);

function importErrorCode(files: GameExportFileMap): string {
  try {
    parseGameExportFiles(files);
  } catch (error) {
    if (error instanceof GameImportError) return error.code;
    throw error;
  }
  throw new Error("expected parseGameExportFiles to throw");
}

describe("parseGameExportFiles — hostile input", () => {
  it("missing manifest → manifest-missing", () => {
    expect(importErrorCode(archive({ [GAME_EXPORT_MANIFEST_FILE]: null }))).toBe(
      "manifest-missing",
    );
  });

  it("malformed JSON → manifest-invalid", () => {
    expect(importErrorCode(archive({ [GAME_EXPORT_MANIFEST_FILE]: enc("{nope") }))).toBe(
      "manifest-invalid",
    );
  });

  it("future formatVersion → unsupported-version", () => {
    const manifest = { ...manifestOf(archive()), formatVersion: 2 };
    expect(
      importErrorCode(archive({ [GAME_EXPORT_MANIFEST_FILE]: enc(JSON.stringify(manifest)) })),
    ).toBe("unsupported-version");
  });

  it("schema violation → manifest-invalid with details", () => {
    const manifest = { ...manifestOf(archive()), title: "" };
    try {
      parseGameExportFiles(
        archive({ [GAME_EXPORT_MANIFEST_FILE]: enc(JSON.stringify(manifest)) }),
      );
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(GameImportError);
      expect((error as GameImportError).code).toBe("manifest-invalid");
      expect((error as GameImportError).details.some((d) => d.startsWith("title"))).toBe(true);
    }
  });

  it("missing game.html → code-missing", () => {
    expect(importErrorCode(archive({ [GAME_EXPORT_CODE_FILE]: null }))).toBe("code-missing");
  });

  it("blocked pattern in code → unsafe-code", () => {
    const evil = builtBundle().replace("<script>", "<script>fetch('https://x');");
    expect(importErrorCode(archive({ [GAME_EXPORT_CODE_FILE]: enc(evil) }))).toBe(
      "unsafe-code",
    );
  });

  it("oversized code → code-too-large", () => {
    const huge = builtBundle().replace(
      "</body>",
      `<!--${"a".repeat(512 * 1024)}--></body>`,
    );
    expect(importErrorCode(archive({ [GAME_EXPORT_CODE_FILE]: enc(huge) }))).toBe(
      "code-too-large",
    );
  });

  it("declared background asset missing → background-missing", () => {
    expect(importErrorCode(archive({ "assets/background.png": null }))).toBe(
      "background-missing",
    );
  });

  it("background without a placeholder in code → ignored with warning", () => {
    const noPlaceholder = builtBundle().replace(
      /<style id="background-image">.*?<\/style>/,
      "",
    );
    const parsed = parseGameExportFiles(
      archive({ [GAME_EXPORT_CODE_FILE]: enc(noPlaceholder) }),
    );
    expect(parsed.backgroundDataUrl).toBeNull();
    expect(parsed.warnings.some((w) => w.includes("Background image ignored"))).toBe(true);
  });

  it("code that breaks the bridge protocol → invalid-code", () => {
    const broken = builtBundle().replace("game:ready", "game:maybe");
    expect(importErrorCode(archive({ [GAME_EXPORT_CODE_FILE]: enc(broken) }))).toBe(
      "invalid-code",
    );
  });

  it("unknown tags are dropped and surfaced", () => {
    const manifest = { ...manifestOf(archive()), tags: ["math", "made-up"] };
    const parsed = parseGameExportFiles(
      archive({ [GAME_EXPORT_MANIFEST_FILE]: enc(JSON.stringify(manifest)) }),
    );
    expect(parsed.tags).toEqual(["math"]);
    expect(parsed.droppedTags).toEqual(["made-up"]);
  });

  it("accepts null metadata values in a foreign manifest", () => {
    const manifest = {
      ...manifestOf(archive()),
      metadata: { capabilities: [], perspective: null },
    };
    const parsed = parseGameExportFiles(
      archive({ [GAME_EXPORT_MANIFEST_FILE]: enc(JSON.stringify(manifest)) }),
    );
    expect(parsed.manifest.metadata).toEqual({ capabilities: [] });
  });

  it("invalid transcript degrades to null + warning", () => {
    const parsed = parseGameExportFiles(
      archive({ [GAME_EXPORT_TRANSCRIPT_FILE]: enc('[{"role":"robot"}]') }),
    );
    expect(parsed.transcript).toBeNull();
    expect(parsed.warnings.some((w) => w.includes("conversation"))).toBe(true);
  });

  it("announced-but-absent transcript yields a warning", () => {
    const manifest = { ...manifestOf(archive()), hasTranscript: true };
    const parsed = parseGameExportFiles(
      archive({ [GAME_EXPORT_MANIFEST_FILE]: enc(JSON.stringify(manifest)) }),
    );
    expect(parsed.transcript).toBeNull();
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });
});

describe("helpers", () => {
  it("data URL ↔ bytes round-trip", () => {
    const decoded = dataUrlToBytes(BG_DATA_URL);
    expect(decoded?.mimeType).toBe("image/png");
    expect(bytesToDataUrl("image/png", decoded!.bytes)).toBe(BG_DATA_URL);
    expect(dataUrlToBytes("not-a-data-url")).toBeNull();
  });

  it("maps known mime types to extensions", () => {
    expect(extensionForMimeType("image/jpeg")).toBe("jpg");
    expect(extensionForMimeType("image/x-weird")).toBeNull();
  });

  it("slugs the zip filename", () => {
    expect(gameExportFileName("Späce Count! 🚀")).toBe("space-count.dodi-game.zip");
    expect(gameExportFileName("!!!")).toBe("game.dodi-game.zip");
  });

  it("admits only contract paths", () => {
    expect(isGameExportEntryPath("manifest.json")).toBe(true);
    expect(isGameExportEntryPath("assets/background.webp")).toBe(true);
    expect(isGameExportEntryPath("../evil.html")).toBe(false);
    expect(isGameExportEntryPath("assets/extra.png")).toBe(false);
  });
});
