/**
 * Tool definitions and execution for the game-coding agent's agentic loop.
 *
 * The agent calls these during its multi-turn conversation to write, validate,
 * and read game code. Pure execution (no I/O) so it runs client-side in the
 * browser loop — the provider key never leaves the vault.
 */

import Anthropic from "@anthropic-ai/sdk";

import { validateGameCode, type ValidationResult } from "@dodi/games/agent-validator";
import {
  BRIDGE_INTERFACE_TEMPLATE,
  coerceProgressKind,
  coerceSuccessCriteria,
} from "@dodi/games/game-spec";
import { SUCCESS_SYSTEM_TEMPLATE, type ProgressKind, type SuccessCriteria } from "@dodi/games/success";
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
          items: { type: "string" },
          description:
            "Tags for discoverability. Prefer the predefined catalog: counting, math, " +
            "language, creativity, science, stories. Add extra descriptive tags only if helpful.",
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
];

// ---------------------------------------------------------------------------
// Tool execution context
// ---------------------------------------------------------------------------

export interface ToolContext {
  /** Current game code (for read_existing_game) */
  existingCode?: string;
  /** Current game markdown (for read_existing_game) */
  existingMarkdown?: string;
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

export function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  context: ToolContext,
): { result: string; writeResult?: LastWriteResult } {
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
      const validation: ValidationResult = validateGameCode(code);

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
