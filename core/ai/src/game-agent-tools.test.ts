import { describe, expect, it, vi } from "vitest";

import {
  AGENT_TOOLS,
  buildAgentTools,
  executeTool,
  MAX_BACKGROUND_IMAGE_CALLS,
  MAX_PREVIEW_IMAGE_CALLS,
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
});
