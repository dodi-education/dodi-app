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
 * - `server`   — meta: offloaded to the in-browser thinking model (analyze_game_state)
 * - `host`     — meta: answered by the host app (launch_game, read_game_state)
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
  /**
   * For client-intercepted tools: the internal bridge command the APP sends the
   * game with the result (generate_drawing → set_generated_image,
   * generate_text → set_generated_text). Drives handler validation.
   */
  deliveryCommand?: string;
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
    kind: "host",
    voiceExposed: true,
    meta: true,
    declarable: false,
    description:
      "Read the CURRENT structured game state as JSON — instant, no analysis. Use for factual " +
      "questions about the game: score, progress, the current question or task, items, settings. " +
      "Returns the raw state for you to interpret. Does NOT see visuals — for what a drawing or " +
      "creation looks like, use analyze_game_state instead.",
    parameters: { type: "object", properties: {} },
    implementationNote: "Host tool — do not implement.",
  },
  {
    name: "analyze_game_state",
    kind: "server",
    voiceExposed: true,
    meta: true,
    declarable: false,
    description:
      "Deeply analyze the current game state (with a screenshot of the game when available). " +
      "Use when the child asks about what they've created, drawn, or built, or when you need " +
      "to understand complex state to give helpful feedback. E.g. 'What did I draw?', " +
      "'How am I doing?', 'What does my painting look like?'. Takes a few seconds.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "What to analyze about the game state" },
      },
      required: ["question"],
    },
    implementationNote:
      "Host/agent tool — do not implement. To make analyze_game_state see your visual surface, " +
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
    deliveryCommand: "set_generated_image",
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

  // ── AI-written content (stories, questions, word lists) ──
  {
    name: "generate_text",
    kind: "client",
    voiceExposed: true,
    declarable: true,
    deliveryCommand: "set_generated_text",
    description:
      "Write fresh, tailored text content for this game and place it into the game's content " +
      "slots: a story, questions, word lists, numbers as words. This is the ONLY way to put " +
      "new text into the game — call it when the child asks for a new story, new questions, or " +
      "fresh content, or when the game needs its text refilled. Describe WHAT to write in " +
      "`request` (topic, difficulty, the child's wishes); one call fills ALL of the game's " +
      "current slots with one coherent set of texts.",
    parameters: {
      type: "object",
      properties: {
        request: {
          type: "string",
          description:
            'What to write, e.g. "a short bedtime story about a brave hedgehog, plus 3 easy questions about it".',
        },
      },
      required: ["request"],
    },
    implementationNote:
      "The APP generates the text and sends you a set_generated_text command with " +
      "{ slots: { <slotId>: <text> } } — or { slots: {}, error } on failure. Declare your " +
      "fillable slots in EVERY game:state as state.contentSlots: [{ id, description }] (the " +
      "description says what belongs in the slot: content, format, rough length); you may " +
      "change the slot set dynamically. Use ONE SLOT PER DISPLAYED FIELD (e.g. story_title, " +
      "story_text, question_1, answer_correct, answer_wrong_1, hint) — NEVER one combined slot " +
      "in a self-invented format you parse yourself; all slots are filled coherently in one " +
      "generation. Implement set_generated_text (render each slot's text where it belongs AND " +
      "keep the filled content in your state and save_state so Dodi can read it back); do NOT " +
      "implement generate_text yourself. To let the child trigger new content from INSIDE the " +
      "game (a button, or once on first start), post game:event { event: " +
      "'request_generate_text', request: '<what to write>' } and wait for set_generated_text — " +
      "the app rate-limits these requests. Declare 'generate_text' in capabilities to support this.",
  },

  // ── Spoken feedback (game-initiated; never a voice tool) ──
  {
    name: "generate_voice",
    kind: "client",
    voiceExposed: false,
    declarable: true,
    deliveryCommand: "set_generated_voice",
    description:
      "Game→app request: have Dodi read a short game text aloud to the child through the live " +
      "voice session (displayed texts, letters, words, instructions). Game-initiated only — " +
      "Dodi herself speaks directly and never calls this.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The exact text Dodi should read aloud, in the game's language.",
        },
      },
      required: ["text"],
    },
    implementationNote:
      "The APP has Dodi read the text aloud with her own voice, then sends you a " +
      "set_generated_voice command: { ok: true } when she is about to speak, or " +
      "{ ok: false, error } when she can't right now (voice_unavailable when Dodi is muted, " +
      "asleep, or offline; rate_limited; empty_text). Use it for short spoken feedback — " +
      "reading a displayed text, letter, word, or instruction aloud. To request it, post " +
      "game:event { event: 'request_generate_voice', text: '<exact text to read>' } and wait " +
      "for set_generated_voice — the app rate-limits these requests, so never queue several at " +
      "once and never auto-repeat on failure. Keep texts short (one or two sentences). The game " +
      "MUST stay fully playable without voice. Implement set_generated_voice (clear any " +
      "speaking/loading indicator; on error fail quietly — the text stays visible); do NOT " +
      "implement generate_voice yourself. Declare 'generate_voice' in capabilities to support this.",
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
      "game has a visual surface so Dodi can 'see' it via analyze_game_state.",
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
  {
    name: "set_generated_text",
    kind: "internal",
    voiceExposed: false,
    declarable: false,
    description: "App→game: deliver AI-written text for the game's declared content slots.",
    parameters: {
      type: "object",
      properties: {
        slots: {
          type: "object",
          description: "Map of slot id → generated text, one entry per declared content slot.",
        },
        error: {
          type: "string",
          description:
            "Set instead of slot content when the generation failed or was denied " +
            "(e.g. rate_limited, no_thinking_model, generation_failed).",
        },
      },
      required: ["slots"],
    },
    implementationNote:
      "On set_generated_text, render payload.slots[id] into each declared content slot and " +
      "store the filled texts in your game state and save_state (used by generate_text). If " +
      "payload.error is set (slots is then empty), the generation failed: leave the current " +
      "content unchanged, clear any loading UI, and offer a retry. Implied when you declare " +
      "'generate_text'; not declared on its own.",
  },
  {
    name: "set_generated_voice",
    kind: "internal",
    voiceExposed: false,
    declarable: false,
    description:
      "App→game: outcome of a request_generate_voice request (Dodi reads the text aloud).",
    parameters: {
      type: "object",
      properties: {
        ok: {
          type: "boolean",
          description: "True when Dodi is about to read the requested text aloud.",
        },
        error: {
          type: "string",
          description:
            "Set when ok is false: why Dodi can't speak right now " +
            "(voice_unavailable, rate_limited, empty_text).",
        },
      },
      required: ["ok"],
    },
    implementationNote:
      "On set_generated_voice, clear any speaking/loading indicator. When payload.ok is false " +
      "(payload.error says why), fail quietly — keep the text visible and don't auto-retry. " +
      "Implied when you declare 'generate_voice'; not declared on its own.",
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
