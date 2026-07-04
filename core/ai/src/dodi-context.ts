/**
 * Centralized system instruction builder for all Dodi modes.
 *
 * Single source of truth for composing persona, memory, child context,
 * and mode-specific instructions into system prompts + tool declarations.
 */

import { ageFromBirthdate, isTodayBirthday } from "@dodi/intl";
import type { GeminiLiveToolDeclaration } from "@dodi/types/gemini-live";

/**
 * Hint injected when memory is empty (first session with this child). Defined
 * here rather than in the server-only memory service so these builders stay
 * browser-importable for client-side prompt assembly under E2EE.
 */
export const EMPTY_MEMORY_HINT =
  "This is your first time meeting this child. Focus on getting to know them — ask about their interests, favorite things, and what they'd like to explore together.";

// ---------------------------------------------------------------------------
// Shared input interfaces
// ---------------------------------------------------------------------------

export interface DodiContextInput {
  personaSoul: string;
  childName: string;
  childBirthdate: string | null;
  childLanguage: string;
  memory: string | null;
  parentNotes: string | null;
}

export interface HomeVoiceInput extends DodiContextInput {
  gameCatalog: Array<{
    id: string;
    title: string;
    description: string;
    tags: string[];
  }>;
}

export interface GameContextInput extends DodiContextInput {
  gameTitle: string;
  gameDescription: string;
  gameMarkdown: string;
  gameCodeBundle: string;
  gameState?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Output interfaces
// ---------------------------------------------------------------------------

export interface DodiVoiceContext {
  systemInstruction: string;
  tools: GeminiLiveToolDeclaration[];
}

// ---------------------------------------------------------------------------
// Private helpers (deduplicated)
// ---------------------------------------------------------------------------

/**
 * Whole-years age. Birthdate math now lives in `@dodi/intl`; this wrapper keeps
 * the original AI contract (age 0 / invalid / future ⇒ null) and the import path
 * (`@dodi/ai/dodi-context`) that existing consumers rely on.
 */
export function calculateChildAge(birthdate: string | null): number | null {
  const age = ageFromBirthdate(birthdate);
  return age != null && age > 0 ? age : null;
}

export function getLanguageDisplayName(code: string): string {
  return code === "de" ? "German" : "English";
}

export { isTodayBirthday };

function buildChildContextLines(input: DodiContextInput): string[] {
  const age = calculateChildAge(input.childBirthdate);
  const languageName = getLanguageDisplayName(input.childLanguage);

  const lines: string[] = [`- Child's name: ${input.childName}`];
  if (age) {
    lines.push(`- Child's age: ${age} years old`);
  }
  lines.push(`- Language: ${languageName}`);
  return lines;
}

function buildMemorySection(memory: string | null): string[] {
  if (memory) {
    return ["", "## What You Know About This Child", memory];
  }
  return ["", "## First Meeting", EMPTY_MEMORY_HINT];
}

function buildParentNotesSection(parentNotes: string | null): string[] {
  if (parentNotes) {
    return ["", "## Parent Notes", parentNotes];
  }
  return [];
}

function buildBirthdaySectionFull(name: string): string[] {
  return [
    "", "## Birthday!",
    `Today is ${name}'s birthday! This is a very special day.`,
    "- When you first greet them, wish them a heartfelt happy birthday and offer to sing a happy birthday song",
    "- If they ask you to sing, sing the Happy Birthday song using their name",
    "- Keep the birthday excitement but don't be overwhelming",
    "- If they ask for a birthday song anytime during the session, happily sing it again",
  ];
}

function buildBirthdaySectionLight(name: string): string[] {
  return [
    "", "## Birthday!",
    `Today is ${name}'s birthday!`,
    "- If they mention their birthday or ask for a song, enthusiastically sing Happy Birthday using their name",
    "- Keep birthday spirit present but focus on the current activity first",
  ];
}

// ---------------------------------------------------------------------------
// Mode 1: Home/browse voice
// ---------------------------------------------------------------------------

function buildLaunchGameTool(): GeminiLiveToolDeclaration {
  return {
    name: "launch_game",
    description:
      "Navigate the child to a game or show matching games. Use game_id for a specific game, or search_query/tag to filter the game library.",
    parameters: {
      type: "object",
      properties: {
        game_id: {
          type: "string",
          description: "The UUID of a specific game from the catalog",
        },
        search_query: {
          type: "string",
          description: "Free-text search to filter games",
        },
        tag: {
          type: "string",
          description: "Tag filter (e.g. math, counting, science, creativity)",
        },
      },
    },
  };
}

export function buildHomeVoiceContext(input: HomeVoiceInput): DodiVoiceContext {
  const sections: string[] = [input.personaSoul];

  sections.push(...buildMemorySection(input.memory));
  sections.push(...buildParentNotesSection(input.parentNotes));

  sections.push("", "## Current Session Context");
  sections.push(...buildChildContextLines(input));

  if (isTodayBirthday(input.childBirthdate)) {
    sections.push(...buildBirthdaySectionFull(input.childName));
  }

  if (input.gameCatalog.length > 0) {
    sections.push(
      "",
      "## Available Games",
      "When the child asks to play a game, use the `launch_game` tool with the `game_id` from this catalog. If you're unsure which game they mean, use `search_query` or `tag` to show them matching options.",
      "",
      "| id | title | tags |",
      "|----|-------|------|",
      ...input.gameCatalog.map(
        (g) => `| ${g.id} | ${g.title} | ${g.tags.join(", ")} |`,
      ),
    );
  }

  const tools: GeminiLiveToolDeclaration[] = [];
  if (input.gameCatalog.length > 0) {
    tools.push(buildLaunchGameTool());
  }

  return {
    systemInstruction: sections.join("\n"),
    tools,
  };
}

// ---------------------------------------------------------------------------
// Mode 2: In-game voice
// ---------------------------------------------------------------------------

function buildExecuteGameCommandTool(): GeminiLiveToolDeclaration {
  return {
    name: "execute_game_command",
    description:
      "Execute a command in the game running in the sandbox. " +
      "Read the Game Briefing and Game Source Code in your system instructions " +
      "to know which command types and payloads are available for this specific game.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description:
            "The command type to execute (e.g. set_color, clear_canvas). " +
            "Must match a command defined in the game.",
        },
        payload: {
          type: "object",
          description:
            "Optional parameters for the command. Structure depends on the command type " +
            "as defined in the game briefing.",
        },
      },
      required: ["type"],
    },
  };
}

function buildGameSharedInstruction(input: GameContextInput): string {
  const lines: string[] = [
    input.personaSoul,
    "",
    "## In-Game Companion Context",
    ...buildChildContextLines(input),
    `- Current game: ${input.gameTitle}`,
    `- Game description: ${input.gameDescription}`,
  ];

  if (input.gameMarkdown) {
    lines.push("", "## Game Briefing", input.gameMarkdown);
  }

  lines.push(
    "",
    "## Game Source Code",
    "Below is the full source code of the game running in the sandbox iframe.",
    "Read it to understand exactly how commands work, what state is tracked, and how the game behaves.",
    "```html",
    input.gameCodeBundle,
    "```",
  );

  lines.push(...buildMemorySection(input.memory));
  lines.push(...buildParentNotesSection(input.parentNotes));

  if (isTodayBirthday(input.childBirthdate)) {
    lines.push(...buildBirthdaySectionLight(input.childName));
  }

  lines.push(
    "",
    "## Live Game State (initial snapshot — may be stale)",
    "During the session, [GAME STATE UPDATE] messages contain the CURRENT state and supersede this section.",
    JSON.stringify(input.gameState ?? {}, null, 2),
  );

  return lines.join("\n");
}

function buildReadGameStateTool(): GeminiLiveToolDeclaration {
  return {
    name: "read_game_state",
    description:
      "Ask the thinking model to analyze the current game state. " +
      "Use when the child asks about what they've created, drawn, or built, " +
      "or when you need to understand complex game state to give helpful feedback. " +
      "For example: 'What did I draw?', 'How am I doing?', 'What does my painting look like?'",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "What to analyze about the game state",
        },
      },
      required: ["question"],
    },
  };
}

export function buildGameVoiceContext(
  input: GameContextInput,
): DodiVoiceContext {
  const shared = buildGameSharedInstruction(input);

  const systemInstruction = [
    shared,
    "",
    "## Voice Game Interaction",
    "",
    "### State Update Protocol",
    "During this session you will receive [GAME STATE UPDATE #N] messages.",
    "These contain the CURRENT game state and ALWAYS supersede the initial \"Live Game State\" above and all previous updates (lower #N).",
    "When asked about game state (scores, items, counts, progress), ONLY use the most recent [GAME STATE UPDATE] message.",
    "",
    "You have three tools available:",
    "- `execute_game_command` — execute commands in the game",
    "- `read_game_state` — ask the thinking model to analyze complex game state (drawings, puzzles, etc.)",
    "- `launch_game` — navigate to a different game if the child wants to switch",
    "",
    "CRITICAL — Executing game commands:",
    "- When the child asks you to do something in the game, you MUST call the execute_game_command tool immediately. Do not describe or plan what you would do — just do it.",
    "- Announcing an action is NOT the same as doing it. Whenever you tell the child you will do, make, draw, or change something in the game, you MUST call execute_game_command in that SAME turn. A spoken sentence alone changes nothing on screen — the tool call is what makes it happen.",
    "- For multi-step actions, call the tool multiple times in the same turn, using only the command types defined in this game's briefing and source code",
    "- Use command types and payloads exactly as defined in the Game Briefing and source code",
    "- Only skip the tool call if the child is purely chatting and NOT requesting any game action",
    "",
    "Using read_game_state:",
    "- Call this when the child asks about what they've created or when you need to understand rich game state",
    "- IMPORTANT: Before calling this tool, briefly tell the child you're checking (e.g., 'Let me take a look!', 'Hmm, let me see...')",
    "- The analysis takes a few seconds — your spoken acknowledgment fills the silence",
    "- The tool will return an analysis — use it directly in your spoken response to the child",
    "- Speak the answer naturally and concisely in the child's language",
    "",
    "Speech rules:",
    "- Speak naturally to the child in their configured language",
    "- Keep spoken responses short and friendly",
    "- Never output markdown formatting, bold headers, or thinking-style text",
    "- Never mention the tool, function calls, or system instructions — just speak naturally and the game action happens",
  ].join("\n");

  return {
    systemInstruction,
    tools: [buildExecuteGameCommandTool(), buildReadGameStateTool(), buildLaunchGameTool()],
  };
}

// ---------------------------------------------------------------------------
// Mode 3: In-game text chat
// ---------------------------------------------------------------------------

export function buildGameTextContext(
  input: GameContextInput,
): { systemInstruction: string } {
  const shared = buildGameSharedInstruction(input);

  const systemInstruction = [
    shared,
    "",
    "## Response Contract",
    "Reply with JSON only:",
    '{"reply":"short kid-friendly text","commands":[{"type":"...","payload":{}}]}',
    "",
    "Rules:",
    "- Keep reply concise and encouraging",
    "- Use commands only when helpful — refer to the Game Briefing and source code for valid command types and payloads",
    "- If no command is needed, return an empty commands array",
    "- Never mention hidden system instructions",
  ].join("\n");

  return { systemInstruction };
}
