/**
 * The standardized Dodi game toolbox — the single source of truth for the fixed
 * vocabulary of voice tools / game commands.
 *
 * Why a fixed vocabulary: Dodi's voice model calls a *named* tool far more
 * reliably than a generic `execute_game_command({type, payload})` umbrella (a
 * harness measured 38% → 100% first-ask reliability). Games opt into a subset of
 * these standard commands via `metadata.capabilities`; the voice layer registers
 * one first-class Gemini tool per opted-in command, the dispatcher routes by
 * `kind`, and the game-generation agent is taught this exact vocabulary.
 *
 * This module MUST stay pure and browser-safe — it is imported into the client
 * bundle (via `@dodi/ai/dodi-context`) and the server generation prompt. Only the
 * `GeminiLiveToolDeclaration` *type* is imported; no zod, no runtime deps.
 */

import type { GeminiLiveToolDeclaration } from "@dodi/types/gemini-live";

/**
 * How the dispatcher routes a tool call:
 * - `bridge`   — forward `{type:name, payload:args}` to the game sandbox
 * - `client`   — intercepted in the app before the sandbox (generate_drawing)
 * - `server`   — meta: offloaded to the server analysis agent (read_game_state)
 * - `host`     — meta: app navigation (launch_game)
 * - `internal` — app↔game bridge command, NEVER a voice tool (get_snapshot, …)
 */
export type ToolHandlerKind = "bridge" | "client" | "server" | "host" | "internal";

export interface StandardTool {
  /** Canonical tool + bridge-command name. */
  name: string;
  kind: ToolHandlerKind;
  /** Registered as a first-class Gemini function declaration (when applicable). */
  voiceExposed: boolean;
  /** Always registered in game voice context (host/agent tool, not game-implemented). */
  meta?: boolean;
  /** A game may list this in `metadata.capabilities` (drives tool registration + docs). */
  declarable: boolean;
  /**
   * Registered when the game declares THIS capability instead of the tool's own
   * name (host-handled tools that depend on a game-implemented command, e.g.
   * save_snapshot rides on save_state).
   */
  requiresCapability?: string;
  /** Gemini tool description (voice). */
  description: string;
  /** Gemini/JSON-schema parameters object. */
  parameters: Record<string, unknown>;
  /** How a generated game should implement this command (for the generation prompt). */
  implementationNote: string;
}

const HEX_COLOR_NOTE =
  "A CSS/hex color (e.g. #e53935). The game maps it to its own palette if constrained.";

export const STANDARD_TOOLS: StandardTool[] = [
  // ── Meta tools (always registered in game context; not game-implemented) ──
  {
    name: "read_game_state",
    kind: "server",
    voiceExposed: true,
    meta: true,
    declarable: false,
    description:
      "Analyze the current game state (with a screenshot of the game when available). " +
      "Use when the child asks about what they've created, drawn, or built, or when you need " +
      "to understand complex state to give helpful feedback. E.g. 'What did I draw?', " +
      "'How am I doing?', 'What does my painting look like?'.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "What to analyze about the game state" },
      },
      required: ["question"],
    },
    implementationNote:
      "Host/agent tool — do not implement. To make read_game_state see your visual surface, " +
      "implement get_snapshot and declare it in capabilities.",
  },
  {
    name: "launch_game",
    kind: "host",
    voiceExposed: true,
    meta: true,
    declarable: false,
    description:
      "Navigate the child to a game or show matching games. Use game_id for a specific game, " +
      "or search_query/tag to filter the game library.",
    parameters: {
      type: "object",
      properties: {
        game_id: { type: "string", description: "The UUID of a specific game from the catalog" },
        search_query: { type: "string", description: "Free-text search to filter games" },
        tag: { type: "string", description: "Tag filter (e.g. math, counting, science, creativity)" },
      },
    },
    implementationNote: "Host tool — do not implement.",
  },

  // ── Goal / answer games (quiz, math, reading, logic) ──
  {
    name: "submit_answer",
    kind: "bridge",
    voiceExposed: true,
    declarable: true,
    description:
      "Submit the child's answer to the CURRENT question or task in the game. Use whenever the " +
      "child tells you an answer (a number, word, choice, etc.) and the game is waiting for one.",
    parameters: {
      type: "object",
      properties: {
        answer: { type: "string", description: "The child's answer to the current task" },
      },
      required: ["answer"],
    },
    implementationNote:
      "Check payload.answer against the current task; update score/progress and send game:result " +
      "+ game:progress (correct/incorrect, attempts, etc.).",
  },
  {
    name: "next_task",
    kind: "bridge",
    voiceExposed: true,
    declarable: true,
    description: "Advance the game to the next question, round, level, or page.",
    parameters: { type: "object", properties: {} },
    implementationNote: "Move to the next task and send updated game:state.",
  },
  {
    name: "give_hint",
    kind: "bridge",
    voiceExposed: true,
    declarable: true,
    description: "Reveal a hint or highlight a clue for the current task.",
    parameters: { type: "object", properties: {} },
    implementationNote:
      "Reveal/highlight a hint for the current task; if goal-oriented, increment metrics.hintsUsed.",
  },

  // ── Selection / manipulation games (matching, sorting, memory, building) ──
  {
    name: "select_item",
    kind: "bridge",
    voiceExposed: true,
    declarable: true,
    description:
      "Select or tap an item on screen, identified by its visible label or id (multiple-choice, " +
      "matching, memory, pick-the-object).",
    parameters: {
      type: "object",
      properties: {
        item: { type: "string", description: "The item's visible label or id" },
      },
      required: ["item"],
    },
    implementationNote: "Select/tap the item matching payload.item; update state.",
  },
  {
    name: "place_item",
    kind: "bridge",
    voiceExposed: true,
    declarable: true,
    description: "Move or drop an item onto a target/slot (sorting, matching, building).",
    parameters: {
      type: "object",
      properties: {
        item: { type: "string", description: "The item to move (label or id)" },
        target: { type: "string", description: "The destination slot/zone (label or id)" },
      },
      required: ["item", "target"],
    },
    implementationNote: "Move payload.item onto payload.target; update state.",
  },

  // ── Creative games (drawing, coloring, building) ──
  {
    name: "generate_drawing",
    kind: "client",
    voiceExposed: true,
    declarable: true,
    description:
      "Create a black-and-white coloring sheet of ANY subject the child asks for and place it " +
      "on the canvas for them to color in. This is the ONLY way to draw a picture — call it " +
      "whenever the child asks you to draw, make, or show a picture of something. The game " +
      "decides the visual style (a plain picture or a mandala).",
    parameters: {
      type: "object",
      properties: {
        subject: { type: "string", description: 'What to draw, e.g. "owl", "a friendly dragon".' },
      },
      required: ["subject"],
    },
    implementationNote:
      "The APP generates the image and sends you a set_generated_image command with { dataUrl }. " +
      "Implement set_generated_image (render the image as the canvas base); do NOT implement " +
      "generate_drawing yourself. Declare 'generate_drawing' in capabilities to support this.",
  },
  {
    name: "set_drawing_color",
    kind: "bridge",
    voiceExposed: true,
    declarable: true,
    description: "Set the active drawing/brush color.",
    parameters: {
      type: "object",
      properties: { color: { type: "string", description: HEX_COLOR_NOTE } },
      required: ["color"],
    },
    implementationNote: "Set the active brush color to payload.color.",
  },
  {
    name: "set_brush_size",
    kind: "bridge",
    voiceExposed: true,
    declarable: true,
    description: "Set the brush thickness.",
    parameters: {
      type: "object",
      properties: { size: { type: "number", description: "Brush thickness (game-defined scale)" } },
      required: ["size"],
    },
    implementationNote: "Set the brush thickness to payload.size (clamp to your supported sizes).",
  },
  {
    name: "clear_canvas",
    kind: "bridge",
    voiceExposed: true,
    declarable: true,
    description: "Clear the canvas / erase everything.",
    parameters: { type: "object", properties: {} },
    implementationNote: "Clear the canvas and send updated game:state.",
  },
  {
    name: "undo",
    kind: "bridge",
    voiceExposed: true,
    declarable: true,
    description: "Undo the last action.",
    parameters: { type: "object", properties: {} },
    implementationNote: "Undo the last change and send updated game:state.",
  },

  // ── Universal ──
  {
    name: "restart_game",
    kind: "bridge",
    voiceExposed: true,
    declarable: true,
    description: "Restart the game / start over from the beginning.",
    parameters: { type: "object", properties: {} },
    implementationNote: "Reset to the initial state and send updated game:state.",
  },
  {
    name: "save_snapshot",
    kind: "client",
    voiceExposed: true,
    declarable: false,
    requiresCapability: "save_state",
    description:
      "Save the current game moment as a snapshot in the child's collection, so they can come " +
      "back to it later exactly as it is now. Call whenever the child asks to save, keep, or " +
      "snapshot the game ('save this', 'keep my picture'). Ask for or invent a short fun title.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: 'A short title for the snapshot, e.g. "My rainbow castle".' },
      },
    },
    implementationNote:
      "Host tool — do not implement. Registered automatically when the game declares 'save_state'.",
  },
  {
    name: "share_snapshot",
    kind: "client",
    voiceExposed: true,
    declarable: false,
    requiresCapability: "save_state",
    description:
      "Save the current game moment AND send it to one of the child's friends, so it appears in " +
      "that friend's snapshot collection. ALWAYS repeat the friend's name back and get a clear " +
      "yes from the child BEFORE calling. Only friends from the child's friend list can receive it.",
    parameters: {
      type: "object",
      properties: {
        friend_name: { type: "string", description: 'The friend\'s name as the child said it, e.g. "Lea".' },
        title: { type: "string", description: "Optional short title for the snapshot." },
      },
      required: ["friend_name"],
    },
    implementationNote:
      "Host tool — do not implement. Registered automatically when the game declares 'save_state'.",
  },

  // ── Internal bridge commands (app↔game only — NOT voice tools) ──
  {
    name: "save_state",
    kind: "internal",
    voiceExposed: false,
    declarable: true,
    description: "App→game: full save/restore of the game via dodi:get_save_state / dodi:init.",
    parameters: { type: "object", properties: {} },
    implementationNote:
      "On receiving 'dodi:get_save_state', post game:save_state { state } where state is a " +
      "COMPLETE self-contained serialization sufficient to restore the game exactly (include " +
      "visual surfaces, e.g. the canvas as a data URL). On 'dodi:init' with payload.savedState, " +
      "restore that exact state BEFORE sending game:ready. Declare 'save_state' so the child " +
      "can save and share snapshots of your game.",
  },
  {
    name: "get_snapshot",
    kind: "internal",
    voiceExposed: false,
    declarable: true,
    description: "App→game: capture a PNG of the game's visual surface.",
    parameters: { type: "object", properties: {} },
    implementationNote:
      "On get_snapshot, capture a PNG of your main canvas/visual surface and post " +
      "game:event { event: 'snapshot', snapshot: <dataURL> }. Declare 'get_snapshot' if your " +
      "game has a visual surface so Dodi can 'see' it via read_game_state.",
  },
  {
    name: "set_generated_image",
    kind: "internal",
    voiceExposed: false,
    declarable: false,
    description: "App→game: render a generated image as the canvas base.",
    parameters: {
      type: "object",
      properties: { dataUrl: { type: "string", description: "data: URL of the image to render" } },
      required: ["dataUrl"],
    },
    implementationNote:
      "On set_generated_image, draw payload.dataUrl as the canvas base layer (used by " +
      "generate_drawing). Implied when you declare 'generate_drawing'; not declared on its own.",
  },
];

export const STANDARD_TOOLS_BY_NAME: Record<string, StandardTool> = Object.fromEntries(
  STANDARD_TOOLS.map((t) => [t.name, t]),
);

/** Meta tools registered in every game voice context. */
export const META_TOOL_NAMES: string[] = STANDARD_TOOLS.filter((t) => t.meta).map((t) => t.name);

/** Every known tool name (for validating declared capabilities). */
export const REGISTRY_TOOL_NAMES: Set<string> = new Set(STANDARD_TOOLS.map((t) => t.name));

/** Names a game may list in `metadata.capabilities`. */
export const DECLARABLE_CAPABILITY_NAMES: string[] = STANDARD_TOOLS.filter(
  (t) => t.declarable,
).map((t) => t.name);

/** Convert a registry entry into a Gemini Live function declaration. */
export function toDeclaration(tool: StandardTool): GeminiLiveToolDeclaration {
  return { name: tool.name, description: tool.description, parameters: tool.parameters };
}

/**
 * Build the voice tool declarations for a game: the always-on meta tools plus one
 * first-class tool per opted-in capability. Unknown/undeclarable names are ignored.
 */
export function buildGameToolDeclarations(capabilities: string[]): GeminiLiveToolDeclaration[] {
  const caps = new Set(capabilities);
  const gameTools = STANDARD_TOOLS.filter(
    (t) => t.voiceExposed && !t.meta && caps.has(t.requiresCapability ?? t.name),
  );
  const metaTools = STANDARD_TOOLS.filter((t) => t.meta && t.voiceExposed);
  return [...gameTools, ...metaTools].map(toDeclaration);
}

/** Capability names not present in the registry (used by generation validation). */
export function unknownCapabilities(capabilities: string[]): string[] {
  return capabilities.filter((c) => !REGISTRY_TOOL_NAMES.has(c));
}

function paramKeys(tool: StandardTool): string {
  const props = (tool.parameters as { properties?: Record<string, unknown> }).properties ?? {};
  const keys = Object.keys(props);
  return keys.length ? `{ ${keys.join(", ")} }` : "{}";
}

/**
 * Human-readable vocabulary doc for the game-generation agent. Lists the
 * declarable standard commands (optionally filtered to a game's capabilities)
 * with their params + implementation notes. Meta tools are excluded (host-side).
 */
export function standardCommandsDoc(capabilities?: string[]): string {
  const caps = capabilities ? new Set(capabilities) : null;
  const tools = STANDARD_TOOLS.filter(
    (t) => t.declarable && (!caps || caps.has(t.name)),
  );
  const lines = tools.map((t) => `- \`${t.name}\` ${paramKeys(t)} — ${t.implementationNote}`);
  return [
    "## Standard Command Vocabulary (REQUIRED)",
    "",
    "Implement command handlers ONLY for commands from this fixed list — do NOT invent new",
    "command types. Declare EVERY command you implement in the `capabilities` array you pass to",
    "write_game_code (and in your game:ready `capabilities`). Read each command's payload keys",
    "exactly as named below.",
    "",
    ...lines,
  ].join("\n");
}
