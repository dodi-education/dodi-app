/**
 * Tool definitions and execution for the game-coding agent's agentic loop.
 *
 * The agent calls these during its multi-turn conversation to write, validate,
 * and read game code. Execution is side-effect-free except for the injected
 * `generateBackgroundImage` callback (the only I/O, provided by the client) —
 * everything runs client-side in the browser loop so the provider key never
 * leaves the vault.
 */

import Anthropic from "@anthropic-ai/sdk";

import { validateGameCode, type ValidationResult } from "@dodi/games/agent-validator";
import {
  BACKGROUND_IMAGE_PLACEHOLDER,
  BACKGROUND_STYLE_BLOCK,
  hasBackgroundPlaceholder,
} from "@dodi/games/background-image";
import {
  CHAR_STROKE_COORDS,
  CHAR_STROKES_GUIDE,
  getCharStrokes,
  type CharStrokes,
} from "@dodi/games/char-strokes";
import {
  BRIDGE_INTERFACE_TEMPLATE,
  coerceProgressKind,
  coerceSuccessCriteria,
} from "@dodi/games/game-spec";
import { SUCCESS_SYSTEM_TEMPLATE, type ProgressKind, type SuccessCriteria } from "@dodi/games/success";
import { GAME_TAG_IDS } from "@dodi/games/tags";
import { DECLARABLE_CAPABILITY_NAMES, standardCommandsDoc } from "@dodi/games/toolbox";

// ---------------------------------------------------------------------------
// Tool definitions (Anthropic format)
// ---------------------------------------------------------------------------

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "write_game_code",
    description:
      "Write or update the full HTML/CSS/JS game bundle. The code must be a complete, " +
      "self-contained HTML document with inline styles and scripts that implements the " +
      "Dodi bridge protocol. Also provide the markdown briefing document.",
    input_schema: {
      type: "object" as const,
      properties: {
        code: {
          type: "string",
          description: "The complete HTML game code bundle",
        },
        markdown: {
          type: "string",
          description:
            "Markdown briefing document for the AI companion (game overview, rules, " +
            "available commands with examples, state fields, teaching strategy)",
        },
        title: {
          type: "string",
          description: "Short, kid-friendly game title",
        },
        description: {
          type: "string",
          description: "Brief game description",
        },
        changeSummary: {
          type: "string",
          description:
            "A short, friendly recap of what you just built or changed, written for the parent. " +
            "2-4 concise bullet lines (each starting with '- '). For a brand-new game, summarize " +
            "what you made; for an update, summarize only what changed.",
        },
        tags: {
          type: "array",
          items: { type: "string", enum: [...GAME_TAG_IDS] },
          description:
            "Subject tags for discoverability, from this catalog only: " +
            GAME_TAG_IDS.join(", ") +
            '. Pick the ones that fit the game. Additionally add "ai" if the game ' +
            'generates AI text and "ai-image" if it generates AI images.',
        },
        progressKind: {
          type: "string",
          enum: ["goal", "open"],
          description:
            "'goal' if the game has a measurable success objective; 'open' for free/creative play.",
        },
        capabilities: {
          type: "array",
          items: { type: "string", enum: [...DECLARABLE_CAPABILITY_NAMES] },
          description:
            "EVERY standardized command your game implements — chosen ONLY from the standard " +
            "vocabulary (see 'Standard Command Vocabulary' in your system prompt / read_bridge_docs). " +
            "These become Dodi's first-class voice tools. Declare 'get_snapshot' if your game has a " +
            "visual surface (lets Dodi see it), and 'generate_drawing' if it supports AI-drawn pictures. " +
            "Do NOT invent command names. Use an empty array only if the game has no Dodi-driven actions.",
        },
        successCriteria: {
          type: "object",
          description:
            "Structured mapping of the parent's success definition. Use the standardized metric vocabulary only. Empty conditions for open play.",
          properties: {
            description: { type: "string" },
            match: { type: "string", enum: ["all", "any"] },
            conditions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  metric: { type: "string" },
                  op: { type: "string", enum: [">=", ">", "<=", "<", "==", "!="] },
                  value: { type: "number" },
                },
                required: ["metric", "op", "value"],
              },
            },
            requiredMetrics: { type: "array", items: { type: "string" } },
          },
          required: ["description", "match", "conditions", "requiredMetrics"],
        },
      },
      required: ["code", "markdown", "title", "capabilities"],
    },
  },
  {
    name: "validate_game",
    description:
      "Run static analysis on game code to check for sandbox safety violations, " +
      "bridge protocol compliance, and size limits. Always validate before finishing.",
    input_schema: {
      type: "object" as const,
      properties: {
        code: {
          type: "string",
          description: "The HTML game code to validate",
        },
      },
      required: ["code"],
    },
  },
  {
    name: "read_bridge_docs",
    description:
      "Read the Dodi bridge interface specification and sandbox constraints. " +
      "Use this at the start of a task to understand the protocol requirements.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "read_existing_game",
    description:
      "Read the current game's code and markdown documentation. " +
      "Use this when updating or remixing an existing game.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "read_char_paths",
    description:
      "Correct stroke geometry, ORDER, and DIRECTION (German school print convention) for " +
      "letters A-Z/a-z, digits 0-9, and German ÄÖÜäöüß. Use this for ANY game that traces, " +
      "draws, or animates how characters are written — never invent letterform paths. " +
      "Request exactly the characters the game teaches.",
    input_schema: {
      type: "object" as const,
      properties: {
        chars: {
          type: "string",
          description: 'All characters to fetch, as one string (e.g. "ABCabc123ä").',
        },
      },
      required: ["chars"],
    },
  },
];

/** Cost guard: image generations allowed per agent run. */
export const MAX_BACKGROUND_IMAGE_CALLS = 2;

const GENERATE_BACKGROUND_IMAGE_TOOL: Anthropic.Tool = {
  name: "generate_background_image",
  description:
    "Generate the game's background illustration with the account's image model. Call it " +
    "BEFORE write_game_code (at most once — regenerate only if the parent asks for a " +
    "different background). If the parent asked to use an ATTACHED image as the " +
    "background, call use_uploaded_background instead — do NOT generate a recreation. " +
    "Your code then references the image via the " +
    `${BACKGROUND_IMAGE_PLACEHOLDER} placeholder; the app substitutes the real image after ` +
    "you finish, so never write a data: URL yourself.",
  input_schema: {
    type: "object" as const,
    properties: {
      scene: {
        type: "string",
        description:
          "Scene description for the illustration: environment/backdrop only (no main " +
          "characters, no interactive objects, no UI). It MUST be text-free — absolutely no " +
          "letters, numbers, words, or signs anywhere in the image (game text stays DOM/SVG " +
          "so it can be translated). Match the game's theme, mood, and required perspective.",
      },
    },
    required: ["scene"],
  },
};

const USE_UPLOADED_BACKGROUND_TOOL: Anthropic.Tool = {
  name: "use_uploaded_background",
  description:
    "Use one of the parent's attached reference images as the game's background, verbatim. " +
    "Call it BEFORE write_game_code when the parent asks for an attached image as the " +
    "background. Your code then references the image via the " +
    `${BACKGROUND_IMAGE_PLACEHOLDER} placeholder; the app substitutes the real image after ` +
    "you finish, so never write a data: URL yourself.",
  input_schema: {
    type: "object" as const,
    properties: {
      imageIndex: {
        type: "integer",
        description:
          "1-based number of the attached reference image to use, in the order the parent " +
          "attached them. On update tasks the current-state screenshot does NOT count — " +
          "1 is the first reference image after it.",
      },
    },
    required: ["imageIndex"],
  },
};

/**
 * The agent's toolset. The background tools appear only when usable:
 * generation when the setting + provider are on, uploaded backgrounds when the
 * parent's message carries reference images.
 */
export function buildAgentTools(opts: {
  backgroundImage: boolean;
  uploadedImages?: boolean;
}): Anthropic.Tool[] {
  const extras: Anthropic.Tool[] = [];
  if (opts.backgroundImage) extras.push(GENERATE_BACKGROUND_IMAGE_TOOL);
  if (opts.uploadedImages) extras.push(USE_UPLOADED_BACKGROUND_TOOL);
  return extras.length > 0 ? [...AGENT_TOOLS, ...extras] : AGENT_TOOLS;
}

/** Model-facing contract for referencing the background via the placeholder. */
function backgroundUsageInstruction(firstLine: string): string {
  return [
    firstLine,
    "",
    "Reference it EXACTLY ONCE in your code by emitting this verbatim block inside <head>:",
    BACKGROUND_STYLE_BLOCK,
    "and use it on your game root, e.g.:",
    "  background: var(--background-image) center / cover no-repeat;",
    `Never write a data: URL yourself — the app substitutes ${BACKGROUND_IMAGE_PLACEHOLDER} with the real image after you finish. Layer your gradients/shapes and all text as DOM elements on top of it.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Tool execution context
// ---------------------------------------------------------------------------

export interface ToolContext {
  /** Current game code (for read_existing_game) — always placeholder form. */
  existingCode?: string;
  /** Current game markdown (for read_existing_game) */
  existingMarkdown?: string;
  /**
   * Client-injected image generation (the only I/O a tool may do). Present only
   * when the game's "generate background image" setting is on AND an image
   * provider is resolvable. Returns a downscaled data URL; throws on failure.
   */
  generateBackgroundImage?: (scene: string) => Promise<string>;
  /** Background carried over from the existing bundle on update tasks. */
  carriedBackgroundImage?: string;
  /** Background generated or chosen during THIS run (set by the tool cases). */
  freshBackgroundImage?: string;
  /** Parent-attached reference images (data URLs) from the current message. */
  referenceImages?: string[];
  /**
   * Client-injected bound-for-bundle preparation (downscale/recompress) applied
   * to an uploaded image before it becomes the background. Absent → used as-is.
   */
  prepareBackgroundImage?: (dataUrl: string) => Promise<string>;
  /** Image generations spent this run (cost guard). */
  backgroundImageCalls?: number;
  /** Set when a generation attempt threw (surfaced to the studio as a notice). */
  backgroundImageFailed?: boolean;
}

// ---------------------------------------------------------------------------
// Tool result tracking
// ---------------------------------------------------------------------------

export interface LastWriteResult {
  code: string;
  markdown: string;
  title: string;
  description: string;
  tags: string[];
  progressKind: ProgressKind;
  successCriteria: SuccessCriteria;
  changeSummary: string;
  /** Standardized commands the game implements (→ metadata.capabilities). */
  capabilities: string[];
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  context: ToolContext,
): Promise<{ result: string; writeResult?: LastWriteResult }> {
  switch (toolName) {
    case "write_game_code": {
      const code = typeof toolInput.code === "string" ? toolInput.code : "";
      const markdown = typeof toolInput.markdown === "string" ? toolInput.markdown : "";
      const title = typeof toolInput.title === "string" ? toolInput.title : "New Game";
      const description = typeof toolInput.description === "string" ? toolInput.description : "";
      const changeSummary =
        typeof toolInput.changeSummary === "string" ? toolInput.changeSummary : "";
      const tags = Array.isArray(toolInput.tags)
        ? toolInput.tags.filter((t): t is string => typeof t === "string")
        : [];
      const progressKind = coerceProgressKind(toolInput.progressKind);
      const successCriteria = coerceSuccessCriteria(toolInput.successCriteria);
      const capabilities = Array.isArray(toolInput.capabilities)
        ? toolInput.capabilities.filter((c): c is string => typeof c === "string")
        : [];

      if (!code.trim()) {
        return { result: JSON.stringify({ ok: false, error: "Code cannot be empty" }) };
      }

      const invalidCaps = capabilities.filter(
        (c) => !DECLARABLE_CAPABILITY_NAMES.includes(c),
      );
      if (invalidCaps.length > 0) {
        return {
          result: JSON.stringify({
            ok: false,
            error:
              `Unknown capabilities: ${invalidCaps.join(", ")}. Use ONLY the standard vocabulary ` +
              `(${DECLARABLE_CAPABILITY_NAMES.join(", ")}).`,
          }),
        };
      }

      const writeResult: LastWriteResult = {
        code,
        markdown,
        title,
        description,
        tags,
        progressKind,
        successCriteria,
        changeSummary,
        capabilities,
      };

      return {
        result: JSON.stringify({
          ok: true,
          message: `Game code written (${code.length} chars). Use validate_game to check for errors before finishing.`,
        }),
        writeResult,
      };
    }

    case "validate_game": {
      const code = typeof toolInput.code === "string" ? toolInput.code : "";
      // "Image available" = generated this run, or carried over AND still
      // referenced (a carried background may be dropped deliberately — e.g.
      // the parent asked to remove it — so its absence is never an error).
      const hasBackgroundImage =
        context.freshBackgroundImage !== undefined ||
        (context.carriedBackgroundImage !== undefined && hasBackgroundPlaceholder(code));
      const validation: ValidationResult = validateGameCode(code, { hasBackgroundImage });

      return {
        result: JSON.stringify({
          valid: validation.valid,
          errors: validation.errors,
          message: validation.valid
            ? "All checks passed. Code is safe and bridge-compliant."
            : `Found ${validation.errors.length} issue(s). Fix them and validate again.`,
        }),
      };
    }

    case "read_bridge_docs": {
      return {
        result: [
          BRIDGE_INTERFACE_TEMPLATE,
          "",
          "## Sandbox Constraints",
          "- No external scripts (<script src>)",
          "- No fetch(), XMLHttpRequest, WebSocket",
          "- No dynamic import()",
          "- No navigator.sendBeacon, document.cookie",
          "- All code inline in a single HTML file",
          "- Total size < 200KB",
          "",
          "## Required Bridge Messages",
          "- Game must send 'game:ready' with capabilities array on init",
          "- Game must handle 'dodi:command' messages and send 'game:result'",
          "- Game must handle 'dodi:get_state' and send 'game:state'",
          "- Game must proactively send 'game:state' after any user interaction, score/level change, or timed event that changes state",
          "- Always send COMPLETE state after the change is applied",
          "",
          standardCommandsDoc(),
          "",
          SUCCESS_SYSTEM_TEMPLATE,
        ].join("\n"),
      };
    }

    case "read_char_paths": {
      const raw = typeof toolInput.chars === "string" ? toolInput.chars : "";
      const unique = [...new Set([...raw.replace(/\s+/g, "")])].slice(0, 96);
      if (unique.length === 0) {
        return { result: JSON.stringify({ ok: false, error: "chars is required" }) };
      }
      const glyphs: Record<string, CharStrokes> = {};
      const missing: string[] = [];
      for (const ch of unique) {
        const strokes = getCharStrokes(ch);
        if (strokes) glyphs[ch] = strokes;
        else missing.push(ch);
      }
      return {
        result: [
          CHAR_STROKES_GUIDE,
          "",
          JSON.stringify({ coords: CHAR_STROKE_COORDS, glyphs, missing }),
        ].join("\n"),
      };
    }

    case "generate_background_image": {
      if (!context.generateBackgroundImage) {
        return {
          result: JSON.stringify({
            ok: false,
            error: "Background image generation is not enabled for this game.",
          }),
        };
      }
      const scene = typeof toolInput.scene === "string" ? toolInput.scene.trim() : "";
      if (!scene) {
        return { result: JSON.stringify({ ok: false, error: "scene is required" }) };
      }
      context.backgroundImageCalls = (context.backgroundImageCalls ?? 0) + 1;
      if (context.backgroundImageCalls > MAX_BACKGROUND_IMAGE_CALLS) {
        return {
          result: JSON.stringify({
            ok: false,
            error:
              "Image generation budget for this build is used up — keep the image you " +
              "already generated.",
          }),
        };
      }
      try {
        // The data URL stays OUT of the tool result (and thus the transcript):
        // the model only ever sees the placeholder contract below.
        context.freshBackgroundImage = await context.generateBackgroundImage(scene);
        return {
          result: backgroundUsageInstruction("Background image generated successfully."),
        };
      } catch {
        context.backgroundImageFailed = true;
        return {
          result: JSON.stringify({
            ok: false,
            error:
              "Image generation failed — build the game without a generated background " +
              `and do NOT reference ${BACKGROUND_IMAGE_PLACEHOLDER}.`,
          }),
        };
      }
    }

    case "use_uploaded_background": {
      const refs = context.referenceImages ?? [];
      if (refs.length === 0) {
        return {
          result: JSON.stringify({
            ok: false,
            error: "No attached reference images are available on this message.",
          }),
        };
      }
      const index =
        typeof toolInput.imageIndex === "number" ? Math.trunc(toolInput.imageIndex) : NaN;
      if (!Number.isFinite(index) || index < 1 || index > refs.length) {
        return {
          result: JSON.stringify({
            ok: false,
            error: `imageIndex must be between 1 and ${refs.length}.`,
          }),
        };
      }
      try {
        const raw = refs[index - 1];
        // Bound it for the bundle (client-side downscale) — never into the transcript.
        context.freshBackgroundImage = context.prepareBackgroundImage
          ? await context.prepareBackgroundImage(raw)
          : raw;
        return {
          result: backgroundUsageInstruction(
            `Attached image ${index} is now the game's background.`,
          ),
        };
      } catch {
        context.backgroundImageFailed = true;
        return {
          result: JSON.stringify({
            ok: false,
            error:
              "The attached image could not be prepared as a background — build the game " +
              `without it and do NOT reference ${BACKGROUND_IMAGE_PLACEHOLDER}.`,
          }),
        };
      }
    }

    case "read_existing_game": {
      if (!context.existingCode) {
        return {
          result: JSON.stringify({
            ok: false,
            error: "No existing game code available",
          }),
        };
      }

      return {
        result: [
          "## Existing Game Code",
          "```html",
          context.existingCode,
          "```",
          "",
          "## Existing Game Documentation",
          context.existingMarkdown || "(no markdown documentation)",
        ].join("\n"),
      };
    }

    default:
      return {
        result: JSON.stringify({ ok: false, error: `Unknown tool: ${toolName}` }),
      };
  }
}
