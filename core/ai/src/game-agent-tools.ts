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

/** Guard: max find/replace edits accepted in one edit_game_code call. */
export const MAX_GAME_CODE_EDITS = 20;

/**
 * Tools whose streamed tool input drives the studio's write-progress ticker.
 * Both code-writing paths stream large inputs worth counting.
 */
export const WRITE_STREAM_TOOL_NAMES = ["write_game_code", "edit_game_code"] as const;

/** True for a tool whose streamed input should drive the write ticker. */
export function isWriteStreamTool(name: string): boolean {
  return (WRITE_STREAM_TOOL_NAMES as readonly string[]).includes(name);
}

// Metadata properties shared by write_game_code and edit_game_code. On edits
// every one of them is optional ("omit to keep"), so the descriptions are
// wrapped rather than duplicated — see EDIT_META_PROPS below.
const TITLE_PROP = {
  type: "string",
  description: "Short, kid-friendly game title",
} as const;

const DESCRIPTION_PROP = {
  type: "string",
  description: "Brief game description",
} as const;

const TAGS_PROP = {
  type: "array",
  items: { type: "string", enum: [...GAME_TAG_IDS] },
  description:
    "Subject tags for discoverability, from this catalog only: " +
    GAME_TAG_IDS.join(", ") +
    '. Pick the ones that fit the game. Additionally add "ai" if the game ' +
    'generates AI text and "ai-image" if it generates AI images.',
} as const;

const PROGRESS_KIND_PROP = {
  type: "string",
  enum: ["goal", "open"],
  description:
    "'goal' if the game has a measurable success objective; 'open' for free/creative play.",
} as const;

const CAPABILITIES_PROP = {
  type: "array",
  items: { type: "string", enum: [...DECLARABLE_CAPABILITY_NAMES] },
  description:
    "EVERY standardized command your game implements — chosen ONLY from the standard " +
    "vocabulary (see 'Standard Command Vocabulary' in your system prompt / read_bridge_docs). " +
    "These become Dodi's first-class voice tools. Declare 'get_snapshot' if your game has a " +
    "visual surface (lets Dodi see it), 'generate_drawing' if it supports AI-drawn pictures, " +
    "'generate_text' if it presents AI-written text (the game must publish " +
    "state.contentSlots and implement set_generated_text), and 'generate_voice' if it asks " +
    "Dodi to read short texts aloud (the game must implement set_generated_voice). " +
    "Do NOT invent command names. Use an empty array only if the game has no Dodi-driven actions.",
} as const;

const SUCCESS_CRITERIA_PROP = {
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
} as const;

/** The same metadata props, re-described as optional overrides for edits. */
const optionalOverride = <T extends { description: string }>(
  prop: T,
): T & { description: string } => ({
  ...prop,
  description:
    "Optional — omit to keep the current value. Provide when your edits change it. " +
    prop.description,
});

const EDIT_META_PROPS = {
  title: optionalOverride(TITLE_PROP),
  description: optionalOverride(DESCRIPTION_PROP),
  tags: optionalOverride(TAGS_PROP),
  progressKind: optionalOverride(PROGRESS_KIND_PROP),
  capabilities: optionalOverride(CAPABILITIES_PROP),
  successCriteria: optionalOverride(SUCCESS_CRITERIA_PROP),
} as const;

const CHANGE_SUMMARY_TEXT =
  "A short, friendly recap of what you just built or changed, written for the parent. " +
  "2-4 concise bullet lines (each starting with '- '). Bullet lines only — no heading " +
  "or intro line, the app shows its own title above the list. For a brand-new game, " +
  "summarize what you made; for an update, summarize only what changed.";

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "write_game_code",
    description:
      "Write or update the full HTML/CSS/JS game bundle. The code must be a complete, " +
      "self-contained HTML document with inline styles and scripts that implements the " +
      "Dodi bridge protocol. Also provide the markdown briefing document. For targeted " +
      "changes to a game that already exists, prefer edit_game_code.",
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
        title: TITLE_PROP,
        description: DESCRIPTION_PROP,
        changeSummary: {
          type: "string",
          description: CHANGE_SUMMARY_TEXT,
        },
        tags: TAGS_PROP,
        progressKind: PROGRESS_KIND_PROP,
        capabilities: CAPABILITIES_PROP,
        successCriteria: SUCCESS_CRITERIA_PROP,
      },
      required: ["code", "markdown", "title", "capabilities"],
    },
  },
  {
    name: "edit_game_code",
    description:
      "Make surgical find/replace edits to the CURRENT game code without resending the " +
      "whole bundle. Prefer this over write_game_code for targeted changes (bug fixes, " +
      "tweaks, small features, validation fixes) — untouched code stays byte-for-byte " +
      "identical, so behavior you fixed earlier cannot regress. Each edit replaces one " +
      "exact occurrence of old_text with new_text; edits apply in order to the result of " +
      "the previous edit; the call is all-or-nothing (a failed call changes NOTHING). " +
      "Copy old_text exactly from the code you last read or wrote, and include enough " +
      "surrounding lines to make it unique.",
    input_schema: {
      type: "object" as const,
      properties: {
        edits: {
          type: "array",
          minItems: 1,
          maxItems: MAX_GAME_CODE_EDITS,
          items: {
            type: "object",
            properties: {
              old_text: {
                type: "string",
                description:
                  "Exact text to replace — must match the current code character-for-character " +
                  "(whitespace included) and occur exactly once.",
              },
              new_text: {
                type: "string",
                description: "Replacement text. An empty string deletes old_text.",
              },
            },
            required: ["old_text", "new_text"],
          },
          description: "Find/replace edits, applied in order, all-or-nothing.",
        },
        changeSummary: {
          type: "string",
          description:
            CHANGE_SUMMARY_TEXT +
            " Cover ALL edits in this call; summaries from multiple edit calls in one " +
            "build are combined automatically.",
        },
        markdown: {
          type: "string",
          description:
            "Optional FULL replacement of the markdown briefing. Provide it whenever your " +
            "edits change rules, commands, state fields, or teaching strategy; omit to keep " +
            "it unchanged.",
        },
        ...EDIT_META_PROPS,
      },
      required: ["edits", "changeSummary"],
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
          description:
            "The HTML game code to validate. Omit to validate the code from your latest " +
            "write_game_code / edit_game_code call.",
        },
      },
      required: [],
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

/** Cost guard: preview-image generations allowed per agent run. */
export const MAX_PREVIEW_IMAGE_CALLS = 2;

const GENERATE_PREVIEW_IMAGE_TOOL: Anthropic.Tool = {
  name: "generate_preview_image",
  description:
    "Generate the game's square list-preview icon with the account's image model. Call it " +
    "AFTER your final write_game_code + validate_game (at most once — regenerate only if " +
    "the parent asks for a different preview), so the icon reflects the finished game. " +
    "The app crops, stores, and shows the result in game lists itself — your code never " +
    "references it and you never see the image.",
  input_schema: {
    type: "object" as const,
    properties: {
      scene: {
        type: "string",
        description:
          "What the icon shows, derived from the game you just wrote: the game's main " +
          "subject or key moment (one clear centered motif — a character, object, or " +
          "scene), plus its mood and dominant colors. It MUST be text-free — no letters, " +
          "numbers, words, or signs anywhere in the image.",
      },
    },
    required: ["scene"],
  },
};

/**
 * The agent's toolset. The image tools appear only when usable: background /
 * preview generation when the respective setting + an image provider are on,
 * uploaded backgrounds when the parent's message carries reference images.
 */
export function buildAgentTools(opts: {
  backgroundImage: boolean;
  uploadedImages?: boolean;
  previewImage?: boolean;
}): Anthropic.Tool[] {
  const extras: Anthropic.Tool[] = [];
  if (opts.backgroundImage) extras.push(GENERATE_BACKGROUND_IMAGE_TOOL);
  if (opts.uploadedImages) extras.push(USE_UPLOADED_BACKGROUND_TOOL);
  if (opts.previewImage) extras.push(GENERATE_PREVIEW_IMAGE_TOOL);
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
   * Metadata of the last write/edit this run, or the update task's baseline.
   * edit_game_code synthesizes a full LastWriteResult from it, so an edit-only
   * run carries the game's real metadata instead of wiping it on persist.
   */
  currentMeta?: Omit<LastWriteResult, "code" | "markdown">;
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
  /**
   * Client-injected preview-image generation. Present only when the game's
   * "preview image" setting is on AND an image provider is resolvable. Receives
   * the scene plus the game's background image (when one exists) as a style
   * reference; returns the CROPPED square list-preview data URL. Throws on
   * failure.
   */
  generatePreviewImage?: (scene: string, backgroundImage?: string) => Promise<string>;
  /** Preview generated during THIS run (set by the tool case). */
  freshPreviewImage?: string;
  /** Preview generations spent this run (cost guard). */
  previewImageCalls?: number;
  /** Set when a preview generation attempt threw (studio shows a notice). */
  previewImageFailed?: boolean;
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

/** A tool result that reports failure to the model (never an SDK error flag). */
function toolError(fields: Record<string, unknown>): { result: string } {
  return { result: JSON.stringify({ ok: false, ...fields }) };
}

/** Shared guard: capability names must come from the standard vocabulary. */
function invalidCapabilityError(capabilities: string[]): { result: string } | null {
  const invalidCaps = capabilities.filter((c) => !DECLARABLE_CAPABILITY_NAMES.includes(c));
  if (invalidCaps.length === 0) return null;
  return toolError({
    error:
      `Unknown capabilities: ${invalidCaps.join(", ")}. Use ONLY the standard vocabulary ` +
      `(${DECLARABLE_CAPABILITY_NAMES.join(", ")}).`,
  });
}

/** Non-overlapping occurrence count of `needle` in `haystack`. */
function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    count++;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return count;
}

const stringOr = (value: unknown, fallback: string): string =>
  typeof value === "string" ? value : fallback;

const stringArrayOr = (value: unknown, fallback: string[]): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : fallback;

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
        return toolError({ error: "Code cannot be empty" });
      }

      const capsError = invalidCapabilityError(capabilities);
      if (capsError) return capsError;

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

    case "edit_game_code": {
      const currentCode = context.existingCode;
      if (!currentCode) {
        return toolError({
          error: "No existing game code to edit. Use write_game_code to create the game first.",
        });
      }

      // Defensive coercion: the xAI driver turns malformed tool JSON into {}.
      const rawEdits = Array.isArray(toolInput.edits) ? toolInput.edits : [];
      if (rawEdits.length === 0) {
        return toolError({
          error: "edits must be a non-empty array of {old_text, new_text} objects.",
        });
      }
      if (rawEdits.length > MAX_GAME_CODE_EDITS) {
        return toolError({
          error:
            `Too many edits (${rawEdits.length}). Max ${MAX_GAME_CODE_EDITS} per call — split ` +
            "them across calls, or use write_game_code for a large overhaul.",
        });
      }

      const edits: { oldText: string; newText: string }[] = [];
      for (let i = 0; i < rawEdits.length; i++) {
        const raw = rawEdits[i];
        const item = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
        const oldText = typeof item.old_text === "string" ? item.old_text : "";
        const newText = typeof item.new_text === "string" ? item.new_text : "";
        if (!oldText) {
          return toolError({
            failedEditIndex: i + 1,
            error: `Edit ${i + 1}: old_text must be a non-empty string.`,
          });
        }
        if (oldText === newText) {
          return toolError({
            failedEditIndex: i + 1,
            error: `Edit ${i + 1} is a no-op (old_text equals new_text). NO edits were applied.`,
          });
        }
        edits.push({ oldText, newText });
      }

      // Metadata overrides apply only when the key is PRESENT — coercing an
      // absent progressKind/successCriteria would reset the baseline.
      const base = context.currentMeta ?? {
        title: "New Game",
        description: "",
        tags: [],
        progressKind: coerceProgressKind(undefined),
        successCriteria: coerceSuccessCriteria(undefined),
        changeSummary: "",
        capabilities: [],
      };
      const capabilities = stringArrayOr(toolInput.capabilities, base.capabilities);
      // Guard capabilities BEFORE applying anything, so a bad-caps call is
      // all-or-nothing like every other failure path.
      const editCapsError = invalidCapabilityError(capabilities);
      if (editCapsError) return editCapsError;

      let working = currentCode;
      for (let i = 0; i < edits.length; i++) {
        const { oldText, newText } = edits[i];
        const firstIndex = working.indexOf(oldText);
        const occurrences = firstIndex === -1 ? 0 : countOccurrences(working, oldText);
        if (occurrences !== 1) {
          const afterNote =
            i > 0 ? ` (checked against the code AFTER applying edits 1-${i})` : "";
          const reason =
            occurrences === 0
              ? "was not found in the current code"
              : `matches ${occurrences} locations — extend it with surrounding lines until it is unique`;
          return toolError({
            failedEditIndex: i + 1,
            occurrences,
            error:
              `Edit ${i + 1} failed: old_text ${reason}${afterNote}. ` +
              `old_text started with: ${JSON.stringify(oldText.slice(0, 120))}. ` +
              "NO edits were applied. Fix this edit and retry; if you are unsure of the exact " +
              "current text, re-read it with read_existing_game; if it keeps failing, use " +
              "write_game_code with the full corrected code.",
          });
        }
        working =
          working.slice(0, firstIndex) + newText + working.slice(firstIndex + oldText.length);
      }

      if (!working.trim()) {
        return toolError({ error: "Edits would leave the code empty — not applied." });
      }

      const newSummary =
        typeof toolInput.changeSummary === "string" ? toolInput.changeSummary.trim() : "";
      const markdownParam = typeof toolInput.markdown === "string" ? toolInput.markdown : "";

      const writeResult: LastWriteResult = {
        code: working,
        markdown: markdownParam.trim() ? markdownParam : (context.existingMarkdown ?? ""),
        title: stringOr(toolInput.title, base.title),
        description: stringOr(toolInput.description, base.description),
        tags: stringArrayOr(toolInput.tags, base.tags),
        progressKind:
          toolInput.progressKind !== undefined
            ? coerceProgressKind(toolInput.progressKind)
            : base.progressKind,
        successCriteria:
          toolInput.successCriteria !== undefined
            ? coerceSuccessCriteria(toolInput.successCriteria)
            : base.successCriteria,
        // Several edit calls in one build each summarize their own edits.
        changeSummary: [base.changeSummary, newSummary].filter(Boolean).join("\n"),
        capabilities,
      };

      return {
        result: JSON.stringify({
          ok: true,
          message:
            `Applied ${edits.length} edit(s). Code is now ${working.length} chars. ` +
            "Use validate_game to check it before finishing (you may omit the code " +
            "parameter to validate this latest code).",
        }),
        writeResult,
      };
    }

    case "validate_game": {
      // Omitted code validates the latest write/edit — the model never has to
      // retype the bundle, and we check the bytes that will actually ship.
      const code =
        typeof toolInput.code === "string" && toolInput.code.trim()
          ? toolInput.code
          : (context.existingCode ?? "");
      // "Image available" = generated this run, or carried over AND still
      // referenced (a carried background may be dropped deliberately — e.g.
      // the parent asked to remove it — so its absence is never an error).
      const hasBackgroundImage =
        context.freshBackgroundImage !== undefined ||
        (context.carriedBackgroundImage !== undefined && hasBackgroundPlaceholder(code));
      const validation: ValidationResult = validateGameCode(code, {
        hasBackgroundImage,
        requireTranslations: true,
      });

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

    case "generate_preview_image": {
      if (!context.generatePreviewImage) {
        return {
          result: JSON.stringify({
            ok: false,
            error: "Preview image generation is not enabled for this game.",
          }),
        };
      }
      const scene = typeof toolInput.scene === "string" ? toolInput.scene.trim() : "";
      if (!scene) {
        return { result: JSON.stringify({ ok: false, error: "scene is required" }) };
      }
      context.previewImageCalls = (context.previewImageCalls ?? 0) + 1;
      if (context.previewImageCalls > MAX_PREVIEW_IMAGE_CALLS) {
        return {
          result: JSON.stringify({
            ok: false,
            error:
              "Preview generation budget for this build is used up — keep the preview " +
              "you already generated.",
          }),
        };
      }
      try {
        // The game's background (fresh this run, else carried over) rides along
        // as a style reference so the icon matches the game's look. The data
        // URL stays OUT of the tool result (and thus the transcript).
        context.freshPreviewImage = await context.generatePreviewImage(
          scene,
          context.freshBackgroundImage ?? context.carriedBackgroundImage,
        );
        return {
          result: JSON.stringify({
            ok: true,
            message:
              "Preview image generated and stored. The app shows it in game lists — " +
              "your code never references it.",
          }),
        };
      } catch {
        context.previewImageFailed = true;
        return {
          result: JSON.stringify({
            ok: false,
            error: "Preview image generation failed — finish the task without one.",
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
