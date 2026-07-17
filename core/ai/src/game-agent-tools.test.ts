import { describe, expect, it, vi } from "vitest";

import {
  AGENT_TOOLS,
  buildAgentTools,
  executeTool,
  MAX_BACKGROUND_IMAGE_CALLS,
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
    `<!doctype html><html><body>${extra}<script>
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
