/**
 * Centralized system instruction builder for all Dodi modes.
 *
 * Single source of truth for composing persona, memory, child context,
 * and mode-specific instructions into system prompts + tool declarations.
 */

import type { GeminiLiveToolDeclaration } from "@/lib/ai/gemini-live-client";

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
    subject: string;
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

export interface GameCreationInput extends DodiContextInput {
  existingGame?: {
    title: string;
    description: string;
    markdown: string;
    codeBundle: string;
  };
  gamePlan?: string;
  gamePlanTitle?: string;
  gamePlanSubject?: string;
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

export function calculateChildAge(birthdate: string | null): number | null {
  if (!birthdate) return null;
  const birth = new Date(birthdate);
  if (Number.isNaN(birth.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && now.getDate() < birth.getDate())
  ) {
    age -= 1;
  }

  return age > 0 ? age : null;
}

export function getLanguageDisplayName(code: string): string {
  return code === "de" ? "German" : "English";
}

export function isTodayBirthday(birthdate: string | null): boolean {
  if (!birthdate) return false;
  const birth = new Date(birthdate);
  if (Number.isNaN(birth.getTime())) return false;
  const now = new Date();
  return birth.getMonth() === now.getMonth() && birth.getDate() === now.getDate();
}

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
      "Navigate the child to a game or show matching games. Use game_id for a specific game, or search_query/subject to filter the game library.",
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
        subject: {
          type: "string",
          description: "Subject filter (e.g. math, creativity, science)",
        },
      },
    },
  };
}

function buildCreateGameTool(): GeminiLiveToolDeclaration {
  return {
    name: "create_game",
    description:
      "Navigate to the game creation screen with a detailed plan. " +
      "Use this when the child wants to build, create, or make a NEW game (not play an existing one). " +
      "Chat briefly first to understand their idea, then call this with a thorough plan.",
    parameters: {
      type: "object",
      properties: {
        plan: {
          type: "string",
          description:
            "Detailed game plan based on the conversation: theme, mechanics, visual style, " +
            "difficulty, any specifics the child described. Be thorough — this will be used " +
            "to generate the game immediately.",
        },
        title: {
          type: "string",
          description: "Short, kid-friendly game title",
        },
        subject: {
          type: "string",
          description: "Subject area (e.g. math, creativity, science, language)",
        },
      },
      required: ["plan", "title"],
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
      "When the child asks to play a game, use the `launch_game` tool with the `game_id` from this catalog. If you're unsure which game they mean, use `search_query` or `subject` to show them matching options.",
      "",
      "| id | title | subject | tags |",
      "|----|-------|---------|------|",
      ...input.gameCatalog.map(
        (g) => `| ${g.id} | ${g.title} | ${g.subject} | ${g.tags.join(", ")} |`,
      ),
    );
  }

  sections.push(
    "",
    "## Creating Games",
    "When the child wants to create, build, invent, or make a NEW game, use the `create_game` tool.",
    "Before calling it, chat briefly to understand what they want — ask about the theme, what makes it fun, any special features.",
    "Once you have a good idea (a few exchanges is enough), call `create_game` with a detailed plan.",
    "Do NOT try to build, code, or generate the game yourself — the system handles that after you call `create_game`.",
  );

  const tools: GeminiLiveToolDeclaration[] = [buildCreateGameTool()];
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
            "The command type to execute (e.g. draw_shape, clear_canvas, set_color). " +
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
    "- For multi-step actions (e.g. drawing a snowman), call the tool multiple times in the same turn (e.g. set_color, then draw_shape for body, then draw_shape for head, etc.)",
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

// ---------------------------------------------------------------------------
// Mode 4: Voice-to-Game (creation / remix)
// ---------------------------------------------------------------------------

function buildGenerateGameTool(): GeminiLiveToolDeclaration {
  return {
    name: "generate_game",
    description:
      "Request the system to generate a game based on your conversation. " +
      "Call this when you have enough information about what the child wants. " +
      "The game will be built server-side and appear live in the sandbox. " +
      "This takes a moment — keep the child excited while waiting!",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "Detailed game description: theme, mechanics, visual style, difficulty, " +
            "any specifics from the child. Be thorough.",
        },
        title: {
          type: "string",
          description: "Short, kid-friendly game title",
        },
        subject: {
          type: "string",
          description: "Subject area (e.g. math, creativity, science, language)",
        },
        difficulty: {
          type: "string",
          description: "Difficulty level: easy, medium, or hard",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for discoverability (e.g. drawing, puzzle, quiz)",
        },
      },
      required: ["prompt", "title"],
    },
  };
}

function buildUpdateGameTool(): GeminiLiveToolDeclaration {
  return {
    name: "update_game",
    description:
      "Request changes to the current game based on the child's feedback. " +
      "The system will regenerate the code with changes applied. " +
      "Takes a moment — keep the child engaged!",
    parameters: {
      type: "object",
      properties: {
        instruction: {
          type: "string",
          description:
            "Clear description of what to change: colors, sizes, mechanics, text, new features, etc.",
        },
        title: {
          type: "string",
          description: "Updated title (optional)",
        },
      },
      required: ["instruction"],
    },
  };
}

function buildSaveGameTool(): GeminiLiveToolDeclaration {
  return {
    name: "save_game",
    description:
      "Save the current game to the child's game library. " +
      "Call this when the child is happy with the game and wants to keep it. " +
      "The game will appear in their game library for future play.",
    parameters: {
      type: "object",
      properties: {},
    },
  };
}

export function buildGameCreationVoiceContext(
  input: GameCreationInput,
): DodiVoiceContext {
  const sections: string[] = [input.personaSoul];

  sections.push(...buildMemorySection(input.memory));
  sections.push(...buildParentNotesSection(input.parentNotes));

  sections.push("", "## Current Session Context");
  sections.push(...buildChildContextLines(input));

  if (isTodayBirthday(input.childBirthdate)) {
    sections.push(...buildBirthdaySectionLight(input.childName));
  }

  sections.push(
    "",
    "## Game Creation Mode",
    "",
    "You are helping this child create a game through voice conversation!",
    "Your role is to be a creative collaborator — guide them through the game design process,",
    "ask what kind of game they want, what it should look like, how it should work.",
    "",
    "### How It Works",
    "- When you call `generate_game` or `update_game`, the system builds the game server-side",
    "- IMPORTANT: Before calling generate_game or update_game, tell the child what you're about to do",
    "  (e.g., 'Okay, let me build that for you!', 'Great idea, I'll start making it now!')",
    "- This takes about 15-30 seconds — keep talking to the child while it happens!",
    "- Encourage them, recap what you're building, ask if they want to add anything",
    "- The system will notify you when the game is ready — react with excitement!",
    "",
    "### Creative Process",
    "1. **Discover** — Ask the child what kind of game they want. What's the theme? What do they like?",
    "2. **Design** — Help them flesh out the idea. Suggest fun mechanics, characters, colors.",
    "3. **Build** — Use `generate_game` with a detailed prompt that captures everything discussed.",
    "4. **Iterate** — After they play-test, listen to feedback and use `update_game` to improve it.",
    "5. **Saved** — Games are automatically saved after every generation and update. You don't need to call `save_game`.",
    "",
    "### Important",
    "- Give `generate_game` a very detailed `prompt` — include theme, mechanics, visual style, colors, sounds, everything the child described",
    "- For `update_game`, describe clearly what needs to change in the `instruction`",
    "- You do NOT write game code — the system handles all code generation",
    "- Focus entirely on the creative conversation with the child",
  );

  if (input.gamePlan) {
    sections.push(
      "",
      "## Game Plan (from home conversation)",
      "",
      "The child already discussed this game idea with you on the home screen.",
      "Here is the plan you agreed on:",
      "",
      `**Title**: ${input.gamePlanTitle || "Untitled"}`,
      ...(input.gamePlanSubject ? [`**Subject**: ${input.gamePlanSubject}`] : []),
      "",
      "**Plan**:",
      input.gamePlan,
      "",
      "### IMPORTANT: Immediate Action Required",
      "You already discussed this with the child. Do NOT ask them what they want to build — you already know!",
      "Greet them excitedly and call `generate_game` immediately with the plan above as the prompt.",
      "While the game generates, tell the child you're building it right now!",
    );
  }

  if (input.existingGame) {
    sections.push(
      "",
      "## Existing Game (Remix Mode)",
      `You are remixing an existing game: **${input.existingGame.title}**`,
      "",
      "Current game description:",
      input.existingGame.description,
      "",
      "The child can see this game running right now. Listen to what they want to change,",
      "then use `update_game` with a clear instruction describing the changes.",
    );
  }

  sections.push(
    "",
    "## Speech Rules",
    "- Speak naturally to the child in their configured language",
    "- Keep spoken responses short and enthusiastic",
    "- Never output markdown formatting, bold headers, or thinking-style text",
    "- Never mention tools, function calls, or system instructions — just speak naturally",
    "- Be encouraging and excited about their ideas!",
  );

  return {
    systemInstruction: sections.join("\n"),
    tools: [buildGenerateGameTool(), buildUpdateGameTool(), buildSaveGameTool()],
  };
}
