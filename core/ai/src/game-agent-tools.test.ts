import { describe, expect, it, vi } from "vitest";

import {
  AGENT_TOOLS,
  buildAgentTools,
  executeTool,
  isWriteStreamTool,
  MAX_BACKGROUND_IMAGE_CALLS,
  MAX_GAME_CODE_EDITS,
  MAX_PREVIEW_IMAGE_CALLS,
  MAX_VIEW_GAME_CALLS,
  renderReport,
  type RenderGameOutput,
  type ToolContext,
} from "./game-agent-tools";

const DATA_URL = "data:image/jpeg;base64,QUJD";

describe("buildAgentTools", () => {
  it("adds generate_background_image only when enabled", () => {
    const off = buildAgentTools({ backgroundImage: false });
    const on = buildAgentTools({ backgroundImage: true });
    expect(off).toBe(AGENT_TOOLS);
    expect(off.map((t) => t.name)).not.toContain("generate_background_image");
    expect(on.map((t) => t.name)).toContain("generate_background_image");
    expect(on).toHaveLength(AGENT_TOOLS.length + 1);
  });

  it("adds use_uploaded_background only when the message has reference images", () => {
    const withUploads = buildAgentTools({ backgroundImage: false, uploadedImages: true });
    expect(withUploads.map((t) => t.name)).toContain("use_uploaded_background");
    expect(withUploads.map((t) => t.name)).not.toContain("generate_background_image");
    const both = buildAgentTools({ backgroundImage: true, uploadedImages: true });
    expect(both).toHaveLength(AGENT_TOOLS.length + 2);
  });

  it("adds generate_preview_image only when enabled", () => {
    const off = buildAgentTools({ backgroundImage: false });
    const on = buildAgentTools({ backgroundImage: false, previewImage: true });
    expect(off.map((t) => t.name)).not.toContain("generate_preview_image");
    expect(on.map((t) => t.name)).toContain("generate_preview_image");
    const all = buildAgentTools({ backgroundImage: true, uploadedImages: true, previewImage: true });
    expect(all).toHaveLength(AGENT_TOOLS.length + 3);
  });

  it("adds view_game only when a screenshot service is configured", () => {
    const off = buildAgentTools({ backgroundImage: false });
    const on = buildAgentTools({ backgroundImage: false, viewGame: true });
    expect(off.map((t) => t.name)).not.toContain("view_game");
    expect(on.map((t) => t.name)).toContain("view_game");
    const all = buildAgentTools({
      backgroundImage: true,
      uploadedImages: true,
      previewImage: true,
      viewGame: true,
    });
    expect(all).toHaveLength(AGENT_TOOLS.length + 4);
  });
});

describe("executeTool view_game", () => {
  const FRAME = "data:image/jpeg;base64,RlJBTUU=";
  const BG = "data:image/jpeg;base64,QkFDS0dST1VORA==";
  const CODE = `<html><head><style id="background-image">:root{--background-image:url("{{BACKGROUND_IMAGE}}")}</style></head><body>game</body></html>`;
  const output = (patch: Partial<RenderGameOutput> = {}): RenderGameOutput => ({
    frames: [{ label: "initial", image: FRAME }],
    ready: true,
    warnings: [],
    errors: [],
    ...patch,
  });

  it("errors when no service is configured or there is no code yet", async () => {
    const noService = await executeTool("view_game", {}, { existingCode: CODE });
    expect(JSON.parse(noService.result)).toMatchObject({ ok: false });
    const noCode = await executeTool("view_game", {}, { renderGame: vi.fn() });
    expect(JSON.parse(noCode.result)).toMatchObject({ ok: false });
    expect(noCode.result).toContain("write_game_code first");
  });

  it("renders the bundle WITH its background injected and returns the frames to look at", async () => {
    const renderGame = vi.fn().mockResolvedValue(output());
    const context: ToolContext = {
      existingCode: CODE,
      freshBackgroundImage: BG,
      renderGame,
      perspective: "side",
    };
    const { result, images } = await executeTool(
      "view_game",
      { steps: [{ label: "after first tap", command: { type: "submit_answer", payload: { answer: "3" } } }] },
      context,
    );
    const input = renderGame.mock.calls[0][0];
    expect(input.code).toContain(BG);
    expect(input.code).not.toContain("{{BACKGROUND_IMAGE}}");
    expect(input.steps).toEqual([
      { label: "after first tap", command: { type: "submit_answer", payload: { answer: "3" } } },
    ]);
    expect(images).toEqual([FRAME]);
    expect(result).toContain("1. initial");
    expect(result).toContain("Side-on");
    expect(result).toContain("edit_game_code");
    expect(result).not.toContain("RUNTIME FAILURE");
    expect(context.viewGameCalls).toBe(1);
  });

  it("falls back to the carried background and tolerates junk steps", async () => {
    const renderGame = vi.fn().mockResolvedValue(output());
    const context: ToolContext = { existingCode: CODE, carriedBackgroundImage: BG, renderGame };
    await executeTool(
      "view_game",
      { steps: [{ nope: 1 }, { label: "  " }, { label: "ok", command: { type: "" } }, "x"] },
      context,
    );
    const input = renderGame.mock.calls[0][0];
    expect(input.code).toContain(BG);
    expect(input.steps).toEqual([{ label: "ok" }]);
  });

  it("reports a crashed game as a runtime failure with the captured errors", async () => {
    const context: ToolContext = {
      existingCode: CODE,
      renderGame: vi
        .fn()
        .mockResolvedValue(output({ ready: false, errors: ["TypeError: x is undefined"], frames: [] })),
    };
    const { result, images } = await executeTool("view_game", {}, context);
    expect(result).toContain("RUNTIME FAILURE");
    expect(result).toContain("TypeError: x is undefined");
    expect(result).toContain("No frame could be captured");
    expect(images).toEqual([]);
  });

  it("marks the run failed (never throws) when the service returns nothing", async () => {
    for (const renderGame of [
      vi.fn().mockResolvedValue(null),
      vi.fn().mockRejectedValue(new Error("down")),
    ]) {
      const context: ToolContext = { existingCode: CODE, renderGame };
      const { result, images } = await executeTool("view_game", {}, context);
      expect(JSON.parse(result)).toMatchObject({ ok: false });
      expect(result).toContain("unavailable");
      expect(images).toBeUndefined();
      expect(context.viewGameFailed).toBe(true);
    }
  });

  it("enforces the per-run render budget", async () => {
    const context: ToolContext = {
      existingCode: CODE,
      renderGame: vi.fn().mockResolvedValue(output()),
    };
    for (let i = 0; i < MAX_VIEW_GAME_CALLS; i++) {
      const { images } = await executeTool("view_game", {}, context);
      expect(images).toEqual([FRAME]);
    }
    const { result, images } = await executeTool("view_game", {}, context);
    expect(JSON.parse(result)).toMatchObject({ ok: false });
    expect(images).toBeUndefined();
  });

  it("renderReport lists frames in order and appends the rubric", () => {
    const report = renderReport(
      output({
        frames: [
          { label: "initial", image: FRAME },
          { label: "after first answer", image: FRAME },
        ],
        warnings: ["step 1: no game:result within 500ms"],
      }),
      null,
    );
    expect(report).toContain("2 real screenshot(s)");
    expect(report.indexOf("1. initial")).toBeLessThan(report.indexOf("2. after first answer"));
    expect(report).toContain("no game:result within 500ms");
    expect(report).toContain("never mixed");
  });
});

describe("executeTool generate_background_image", () => {
  it("errors when the capability is not enabled", async () => {
    const { result } = await executeTool("generate_background_image", { scene: "a meadow" }, {});
    expect(JSON.parse(result)).toMatchObject({ ok: false });
  });

  it("errors on a missing scene", async () => {
    const context: ToolContext = { generateBackgroundImage: vi.fn() };
    const { result } = await executeTool("generate_background_image", { scene: "  " }, context);
    expect(JSON.parse(result)).toMatchObject({ ok: false, error: "scene is required" });
  });

  it("invokes the callback and returns the placeholder contract — never the data URL", async () => {
    const generate = vi.fn().mockResolvedValue(DATA_URL);
    const context: ToolContext = { generateBackgroundImage: generate };
    const { result } = await executeTool(
      "generate_background_image",
      { scene: "a sunny meadow" },
      context,
    );
    expect(generate).toHaveBeenCalledWith("a sunny meadow");
    expect(context.freshBackgroundImage).toBe(DATA_URL);
    expect(result).toContain("{{BACKGROUND_IMAGE}}");
    expect(result).toContain('<style id="background-image">');
    expect(result).not.toContain("data:image");
  });

  it("enforces the per-run call budget", async () => {
    const context: ToolContext = {
      generateBackgroundImage: vi.fn().mockResolvedValue(DATA_URL),
    };
    for (let i = 0; i < MAX_BACKGROUND_IMAGE_CALLS; i++) {
      const { result } = await executeTool("generate_background_image", { scene: "s" }, context);
      expect(result).toContain("{{BACKGROUND_IMAGE}}");
    }
    const { result } = await executeTool("generate_background_image", { scene: "s" }, context);
    expect(JSON.parse(result)).toMatchObject({ ok: false });
    expect(context.generateBackgroundImage).toHaveBeenCalledTimes(MAX_BACKGROUND_IMAGE_CALLS);
  });

  it("maps a generation failure to a graceful error result and flags it", async () => {
    const context: ToolContext = {
      generateBackgroundImage: vi.fn().mockRejectedValue(new Error("provider down")),
    };
    const { result } = await executeTool("generate_background_image", { scene: "s" }, context);
    const parsed = JSON.parse(result) as { ok: boolean; error: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("do NOT reference");
    expect(context.freshBackgroundImage).toBeUndefined();
    expect(context.backgroundImageFailed).toBe(true);
  });
});

describe("executeTool generate_preview_image", () => {
  it("errors when the capability is not enabled", async () => {
    const { result } = await executeTool("generate_preview_image", { scene: "a fox" }, {});
    expect(JSON.parse(result)).toMatchObject({ ok: false });
  });

  it("errors on a missing scene", async () => {
    const context: ToolContext = { generatePreviewImage: vi.fn() };
    const { result } = await executeTool("generate_preview_image", { scene: "  " }, context);
    expect(JSON.parse(result)).toMatchObject({ ok: false, error: "scene is required" });
  });

  it("invokes the callback with the background as style reference — never returning the data URL", async () => {
    const generate = vi.fn().mockResolvedValue(DATA_URL);
    const context: ToolContext = {
      generatePreviewImage: generate,
      freshBackgroundImage: "data:image/jpeg;base64,QkFDS0dST1VORA==",
    };
    const { result } = await executeTool(
      "generate_preview_image",
      { scene: "a counting fox in a meadow" },
      context,
    );
    expect(generate).toHaveBeenCalledWith(
      "a counting fox in a meadow",
      "data:image/jpeg;base64,QkFDS0dST1VORA==",
    );
    expect(context.freshPreviewImage).toBe(DATA_URL);
    expect(JSON.parse(result)).toMatchObject({ ok: true });
    expect(result).not.toContain("data:image");
  });

  it("falls back to the carried background as style reference", async () => {
    const generate = vi.fn().mockResolvedValue(DATA_URL);
    const context: ToolContext = {
      generatePreviewImage: generate,
      carriedBackgroundImage: "data:image/jpeg;base64,Q0FSUklFRA==",
    };
    await executeTool("generate_preview_image", { scene: "s" }, context);
    expect(generate).toHaveBeenCalledWith("s", "data:image/jpeg;base64,Q0FSUklFRA==");
  });

  it("enforces the per-run call budget", async () => {
    const context: ToolContext = {
      generatePreviewImage: vi.fn().mockResolvedValue(DATA_URL),
    };
    for (let i = 0; i < MAX_PREVIEW_IMAGE_CALLS; i++) {
      const { result } = await executeTool("generate_preview_image", { scene: "s" }, context);
      expect(JSON.parse(result)).toMatchObject({ ok: true });
    }
    const { result } = await executeTool("generate_preview_image", { scene: "s" }, context);
    expect(JSON.parse(result)).toMatchObject({ ok: false });
    expect(context.generatePreviewImage).toHaveBeenCalledTimes(MAX_PREVIEW_IMAGE_CALLS);
  });

  it("maps a generation failure to a graceful error result and flags it", async () => {
    const context: ToolContext = {
      generatePreviewImage: vi.fn().mockRejectedValue(new Error("provider down")),
    };
    const { result } = await executeTool("generate_preview_image", { scene: "s" }, context);
    expect(JSON.parse(result)).toMatchObject({ ok: false });
    expect(context.freshPreviewImage).toBeUndefined();
    expect(context.previewImageFailed).toBe(true);
  });
});

describe("executeTool use_uploaded_background", () => {
  const REFS = ["data:image/jpeg;base64,Rk9UTzE=", "data:image/jpeg;base64,Rk9UTzI="];

  it("errors when no reference images exist", async () => {
    const { result } = await executeTool("use_uploaded_background", { imageIndex: 1 }, {});
    expect(JSON.parse(result)).toMatchObject({ ok: false });
  });

  it("errors on an out-of-range or invalid index", async () => {
    for (const imageIndex of [0, 3, Number.NaN, "1" as unknown as number]) {
      const { result } = await executeTool(
        "use_uploaded_background",
        { imageIndex },
        { referenceImages: REFS },
      );
      expect(JSON.parse(result)).toMatchObject({ ok: false });
    }
  });

  it("prepares the chosen image and returns the placeholder contract only", async () => {
    const prepare = vi.fn().mockResolvedValue("data:image/jpeg;base64,U01BTEw=");
    const context: ToolContext = { referenceImages: REFS, prepareBackgroundImage: prepare };
    const { result } = await executeTool("use_uploaded_background", { imageIndex: 2 }, context);
    expect(prepare).toHaveBeenCalledWith(REFS[1]);
    expect(context.freshBackgroundImage).toBe("data:image/jpeg;base64,U01BTEw=");
    expect(result).toContain("Attached image 2");
    expect(result).toContain("{{BACKGROUND_IMAGE}}");
    expect(result).not.toContain("data:image");
  });

  it("uses the image as-is when no prepare callback is injected", async () => {
    const context: ToolContext = { referenceImages: REFS };
    await executeTool("use_uploaded_background", { imageIndex: 1 }, context);
    expect(context.freshBackgroundImage).toBe(REFS[0]);
  });

  it("maps a preparation failure to a graceful error and flags it", async () => {
    const context: ToolContext = {
      referenceImages: REFS,
      prepareBackgroundImage: vi.fn().mockRejectedValue(new Error("canvas died")),
    };
    const { result } = await executeTool("use_uploaded_background", { imageIndex: 1 }, context);
    expect(JSON.parse(result)).toMatchObject({ ok: false });
    expect(context.backgroundImageFailed).toBe(true);
    expect(context.freshBackgroundImage).toBeUndefined();
  });
});

describe("executeTool read_char_paths", () => {
  it("returns guide + strokes for known chars and lists missing ones", async () => {
    const { result } = await executeTool("read_char_paths", { chars: "Aä7€" }, {});
    expect(result).toContain("Character stroke paths");
    const json = JSON.parse(result.slice(result.indexOf("\n{") + 1)) as {
      coords: { baseline: number };
      glyphs: Record<string, number[][][]>;
      missing: string[];
    };
    expect(json.coords.baseline).toBe(80);
    expect(Object.keys(json.glyphs).sort()).toEqual(["7", "A", "ä"]);
    expect(json.glyphs.A).toHaveLength(3);
    expect(json.missing).toEqual(["€"]);
  });

  it("dedupes characters and ignores whitespace", async () => {
    const { result } = await executeTool("read_char_paths", { chars: "A A\nA" }, {});
    const json = JSON.parse(result.slice(result.indexOf("\n{") + 1)) as {
      glyphs: Record<string, unknown>;
    };
    expect(Object.keys(json.glyphs)).toEqual(["A"]);
  });

  it("errors on empty input", async () => {
    const { result } = await executeTool("read_char_paths", { chars: "  " }, {});
    expect(JSON.parse(result)).toMatchObject({ ok: false });
  });
});

describe("executeTool edit_game_code", () => {
  const CODE = "<html><body>const speed = 5;\nconst score = 0;</body></html>";
  const META = {
    title: "Ball Game",
    description: "Bounce a ball",
    tags: ["math"],
    progressKind: "goal" as const,
    successCriteria: {
      description: "Reach 10 points",
      match: "all" as const,
      conditions: [{ metric: "score" as const, op: ">=" as const, value: 10 }],
      requiredMetrics: ["score" as const],
    },
    changeSummary: "",
    capabilities: ["get_snapshot"],
  };
  const ctx = (overrides: Partial<ToolContext> = {}): ToolContext => ({
    existingCode: CODE,
    existingMarkdown: "# Ball Game",
    currentMeta: META,
    ...overrides,
  });
  const edit = (oldText: string, newText: string) => ({ old_text: oldText, new_text: newText });
  const run = (input: Record<string, unknown>, context: ToolContext = ctx()) =>
    executeTool("edit_game_code", { changeSummary: "- tweaked", ...input }, context);

  it("errors when there is no existing code to edit", async () => {
    const { result, writeResult } = await run({ edits: [edit("a", "b")] }, { currentMeta: META });
    expect(JSON.parse(result)).toMatchObject({ ok: false });
    expect(JSON.parse(result).error).toContain("write_game_code");
    expect(writeResult).toBeUndefined();
  });

  it("applies a single edit and carries the metadata baseline", async () => {
    const { result, writeResult } = await run({ edits: [edit("speed = 5", "speed = 6")] });
    expect(JSON.parse(result)).toMatchObject({ ok: true });
    expect(writeResult?.code).toContain("speed = 6");
    expect(writeResult?.code).toContain("score = 0");
    expect(writeResult?.title).toBe("Ball Game");
    expect(writeResult?.tags).toEqual(["math"]);
    expect(writeResult?.progressKind).toBe("goal");
    expect(writeResult?.successCriteria).toEqual(META.successCriteria);
    expect(writeResult?.capabilities).toEqual(["get_snapshot"]);
    expect(writeResult?.markdown).toBe("# Ball Game");
  });

  it("applies edits in order, so a later edit can target earlier output", async () => {
    const { writeResult } = await run({
      edits: [edit("speed = 5", "speed = SPEED"), edit("const speed = SPEED;", "let speed = 9;")],
    });
    expect(writeResult?.code).toContain("let speed = 9;");
    expect(writeResult?.code).not.toContain("SPEED");
  });

  it("applies nothing when one edit's anchor is missing", async () => {
    const context = ctx();
    const { result, writeResult } = await run(
      {
        edits: [edit("speed = 5", "speed = 6"), edit("nowhere", "x"), edit("score = 0", "score = 1")],
      },
      context,
    );
    const parsed = JSON.parse(result);
    expect(parsed).toMatchObject({ ok: false, failedEditIndex: 2, occurrences: 0 });
    expect(parsed.error).toContain("Edit 2");
    expect(parsed.error).toContain("AFTER applying edits 1-1");
    expect(writeResult).toBeUndefined();
    expect(context.existingCode).toBe(CODE);
  });

  it("refuses an ambiguous anchor and reports the occurrence count", async () => {
    const { result, writeResult } = await run(
      { edits: [edit("const", "let")] },
      ctx({ existingCode: "const a = 1;\nconst b = 2;" }),
    );
    const parsed = JSON.parse(result);
    expect(parsed).toMatchObject({ ok: false, failedEditIndex: 1, occurrences: 2 });
    expect(parsed.error).toContain("matches 2 locations");
    expect(writeResult).toBeUndefined();
  });

  it("rejects malformed or empty edit lists", async () => {
    for (const edits of [[], undefined, "nope"]) {
      const { result } = await run({ edits });
      expect(JSON.parse(result)).toMatchObject({ ok: false });
    }
    const tooMany = await run({
      edits: Array.from({ length: MAX_GAME_CODE_EDITS + 1 }, () => edit("speed = 5", "speed = 6")),
    });
    expect(JSON.parse(tooMany.result).error).toContain(`Max ${MAX_GAME_CODE_EDITS}`);
  });

  it("rejects an empty anchor and a no-op edit", async () => {
    const empty = await run({ edits: [edit("", "x")] });
    expect(JSON.parse(empty.result)).toMatchObject({ ok: false, failedEditIndex: 1 });
    const noop = await run({ edits: [edit("speed = 5", "speed = 5")] });
    expect(JSON.parse(noop.result).error).toContain("no-op");
  });

  it("refuses edits that would empty the bundle", async () => {
    const { result, writeResult } = await run({ edits: [edit(CODE, "")] });
    expect(JSON.parse(result).error).toContain("empty");
    expect(writeResult).toBeUndefined();
  });

  it("keeps baseline metadata when a param is absent and overrides when present", async () => {
    const kept = await run({ edits: [edit("speed = 5", "speed = 6")] });
    expect(kept.writeResult?.progressKind).toBe("goal");
    expect(kept.writeResult?.tags).toEqual(["math"]);

    const overridden = await run({
      edits: [edit("speed = 5", "speed = 6")],
      title: "Faster Ball",
      tags: ["math", "logic"],
      progressKind: "open",
    });
    expect(overridden.writeResult?.title).toBe("Faster Ball");
    expect(overridden.writeResult?.tags).toEqual(["math", "logic"]);
    expect(overridden.writeResult?.progressKind).toBe("open");
    // Untouched params still come from the baseline.
    expect(overridden.writeResult?.successCriteria).toEqual(META.successCriteria);
  });

  it("rejects an unknown capability override before applying any edit", async () => {
    const context = ctx();
    const { result, writeResult } = await run(
      { edits: [edit("speed = 5", "speed = 6")], capabilities: ["teleport"] },
      context,
    );
    expect(JSON.parse(result).error).toContain("Unknown capabilities: teleport");
    expect(writeResult).toBeUndefined();
    expect(context.existingCode).toBe(CODE);
  });

  it("appends the change summary onto the baseline", async () => {
    const fresh = await run({ edits: [edit("speed = 5", "speed = 6")], changeSummary: "- faster" });
    expect(fresh.writeResult?.changeSummary).toBe("- faster");

    const second = await run(
      { edits: [edit("score = 0", "score = 1")], changeSummary: "- starts at 1" },
      ctx({ currentMeta: { ...META, changeSummary: "- faster" } }),
    );
    expect(second.writeResult?.changeSummary).toBe("- faster\n- starts at 1");
  });

  it("unescapes literal \\n sequences the model emits inside the change summary", async () => {
    // Some models double-escape newlines in tool-call JSON string arguments, so
    // the parsed summary arrives as one line with literal backslash-n between
    // the bullets. The parent-facing summary must carry real line breaks.
    const { writeResult } = await run({
      edits: [edit("speed = 5", "speed = 6")],
      changeSummary: "- Moved the start letter\\n- Placed the firefly\\n- Golden trail still begins",
    });
    expect(writeResult?.changeSummary).toBe(
      "- Moved the start letter\n- Placed the firefly\n- Golden trail still begins",
    );
  });

  it("replaces the markdown only when the param is given", async () => {
    const replaced = await run({ edits: [edit("speed = 5", "speed = 6")], markdown: "# New" });
    expect(replaced.writeResult?.markdown).toBe("# New");
    const kept = await run({ edits: [edit("speed = 5", "speed = 6")], markdown: "   " });
    expect(kept.writeResult?.markdown).toBe("# Ball Game");
  });

  it("falls back to placeholder metadata when no baseline was seeded", async () => {
    const { writeResult } = await run(
      { edits: [edit("speed = 5", "speed = 6")] },
      { existingCode: CODE },
    );
    expect(writeResult?.title).toBe("New Game");
    expect(writeResult?.tags).toEqual([]);
    expect(writeResult?.capabilities).toEqual([]);
  });
});

describe("executeTool write_game_code change summary", () => {
  it("unescapes literal \\n sequences the model emits inside the change summary", async () => {
    const { writeResult } = await executeTool(
      "write_game_code",
      {
        code: "<html></html>",
        markdown: "# Game",
        title: "Maze",
        capabilities: [],
        changeSummary: "- Added a maze\\n- Added a firefly",
      },
      {},
    );
    expect(writeResult?.changeSummary).toBe("- Added a maze\n- Added a firefly");
  });
});

describe("isWriteStreamTool", () => {
  it("covers both code-writing tools and nothing else", () => {
    expect(isWriteStreamTool("write_game_code")).toBe(true);
    expect(isWriteStreamTool("edit_game_code")).toBe(true);
    expect(isWriteStreamTool("validate_game")).toBe(false);
  });
});

describe("executeTool validate_game background awareness", () => {
  const compliant = (extra: string): string =>
    `<!doctype html><html><head><script type="application/dodi-translations">{"sourceLocale":"en","locales":{"en":{"game.title":"Game"}}}</script></head><body>${extra}<script>
      document.title = dodi.translate('game.title');
      window.addEventListener('message', function (e) {
        if (e.data.type === 'dodi:init') parent.postMessage({ type: 'game:ready', payload: { capabilities: [] } }, '*');
        if (e.data.type === 'dodi:command') parent.postMessage({ type: 'game:result' }, '*');
      });
    </script></body></html>`;
  const PLACEHOLDER_BLOCK = `<style id="background-image">:root{--background-image:url("{{BACKGROUND_IMAGE}}")}</style>`;

  it("flags a fresh image that the code never references", async () => {
    const context: ToolContext = { freshBackgroundImage: DATA_URL };
    const { result } = await executeTool("validate_game", { code: compliant("") }, context);
    const parsed = JSON.parse(result) as { valid: boolean; errors: string[] };
    expect(parsed.valid).toBe(false);
    expect(parsed.errors.some((e) => e.includes("{{BACKGROUND_IMAGE}}"))).toBe(true);
  });

  it("accepts a carried image being dropped (parent asked to remove it)", async () => {
    const context: ToolContext = { carriedBackgroundImage: DATA_URL };
    const { result } = await executeTool("validate_game", { code: compliant("") }, context);
    expect((JSON.parse(result) as { valid: boolean }).valid).toBe(true);
  });

  it("accepts a carried image that stays referenced", async () => {
    const context: ToolContext = { carriedBackgroundImage: DATA_URL };
    const { result } = await executeTool(
      "validate_game",
      { code: compliant(PLACEHOLDER_BLOCK) },
      context,
    );
    expect((JSON.parse(result) as { valid: boolean }).valid).toBe(true);
  });

  it("flags a placeholder reference with no image available", async () => {
    const { result } = await executeTool(
      "validate_game",
      { code: compliant(PLACEHOLDER_BLOCK) },
      {},
    );
    expect((JSON.parse(result) as { valid: boolean }).valid).toBe(false);
  });

  it("validates the latest code when the code param is omitted", async () => {
    const context: ToolContext = { existingCode: compliant("") };
    const { result } = await executeTool("validate_game", {}, context);
    expect((JSON.parse(result) as { valid: boolean }).valid).toBe(true);
  });

  it("reports empty code when neither the param nor the context has any", async () => {
    const { result } = await executeTool("validate_game", {}, {});
    expect((JSON.parse(result) as { valid: boolean }).valid).toBe(false);
  });
});
