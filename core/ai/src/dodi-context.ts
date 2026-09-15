/**
 * Centralized system instruction builder for all Dodi modes.
 *
 * Single source of truth for composing persona, memory, child context,
 * and mode-specific instructions into system prompts + tool declarations.
 */

import { ageFromBirthdate, isTodayBirthday } from "@dodi/intl";
import {
  buildGameToolDeclarations,
  standardCommandsDoc,
  STANDARD_TOOLS_BY_NAME,
  toDeclaration,
} from "@dodi/games/toolbox";
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
  /** The companion's display name ("Dodi" by default, or the custom persona's
   *  name). Weighted very strongly in voice modes as the "you are being
   *  addressed" signal. */
  personaName: string;
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
  /** Standardized command names this game implements (drives first-class tools). */
  capabilities?: string[];
  /**
   * Decrypted display names of the child's ACCEPTED friends — enables the
   * share_snapshot flow ("share this with Lea"). Empty/absent = sharing hidden.
   */
  friendNames?: string[];
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

/**
 * The "am I being talked to?" section — VOICE modes only. Children think out
 * loud: they narrate play, count, read, sing, and talk to people in the room,
 * all through an always-open mic. Without this, the model treats every overheard
 * utterance as a command and acts on it. Being addressed by name is weighted as
 * the strongest possible signal, robust to transcription mangling.
 */
function buildAddressingSection(input: DodiContextInput): string[] {
  const name = input.personaName;
  const germanHint =
    input.childLanguage === "de"
      ? ` The child speaks German, so your name may be transcribed with shifted vowels or German spelling (e.g. "Dodie", "Dodi", "Doti") — accept those too.`
      : "";

  return [
    "",
    "## Hearing vs. Being Asked",
    `Your microphone is always on, so you hear EVERYTHING near the device: ${input.childName} talking to you, but also ${input.childName} narrating their play, thinking out loud, reading, counting, singing, or talking to other people in the room. Much of what you hear is NOT meant for you.`,
    "",
    "The child IS talking to you when:",
    `- They say your name, "${name}". Speech transcription often mangles it (for example "Dody", "Dodie", "Dodee", "Dohdi", or a very similar-sounding word).${germanHint} Treat anything that sounds like your name as your name: hearing it is the strongest possible sign the child is addressing you, and you should respond.`,
    "- They answer a question you just asked, or clearly continue a back-and-forth with you.",
    "- They give a clear instruction for something only you can do.",
    "",
    "The child is NOT talking to you when they narrate their own play (\"now I put the red one here\"), talk to themselves, read or count out loud, sing, or speak to someone else in the room. In those moments do nothing and say nothing: stay warmly, quietly present. Never comment on something you merely overheard.",
    "",
    "When it MIGHT be for you but you are not sure, ask one short, friendly question to check (for example \"Did you mean me?\") instead of acting or launching into an answer.",
  ];
}

// ---------------------------------------------------------------------------
// Mode 1: Home/browse voice
// ---------------------------------------------------------------------------

export function buildHomeVoiceContext(input: HomeVoiceInput): DodiVoiceContext {
  const sections: string[] = [input.personaSoul];

  sections.push(...buildMemorySection(input.memory));
  sections.push(...buildParentNotesSection(input.parentNotes));

  sections.push("", "## Current Session Context");
  sections.push(...buildChildContextLines(input));

  sections.push(...buildAddressingSection(input));

  if (isTodayBirthday(input.childBirthdate)) {
    sections.push(...buildBirthdaySectionFull(input.childName));
  }

  if (input.gameCatalog.length > 0) {
    sections.push(
      "",
      "## Available Games",
      "When the child clearly asks YOU to open or play a game, use the `launch_game` tool with the `game_id` from this catalog. If you're unsure which game they mean, use `search_query` or `tag` to show them matching options. A game mentioned in passing chatter is not a request to open it: launching navigates away from the current screen, so if you are not sure the child is asking you to open it, ask first (for example \"Should I open it?\").",
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
    tools.push(toDeclaration(STANDARD_TOOLS_BY_NAME.launch_game));
  }

  return {
    systemInstruction: sections.join("\n"),
    tools,
  };
}

// ---------------------------------------------------------------------------
// Mode 2: In-game voice
// ---------------------------------------------------------------------------

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

  return lines.join("\n");
}

/**
 * Kid-facing snapshot guidance, shared by the voice and text builders. Only
 * emitted when the game declares `save_state` (otherwise the tools don't exist).
 */
function buildSnapshotSection(input: GameContextInput): string[] {
  const capabilities = input.capabilities ?? [];
  if (!capabilities.includes("save_state")) return [];
  const friendNames = input.friendNames ?? [];

  const lines = [
    "## Saving & Sharing Snapshots",
    "This game supports snapshots — a saved moment the child can reopen later from their Snapshots collection, with everything exactly as it was.",
    "- When the child asks to save or keep the game ('save this', 'keep my picture', 'make a snapshot'), call `save_snapshot`. Ask for — or cheerfully invent — a short fun title and pass it as `title`. The app captures and stores everything.",
    "- Saving takes a moment; the tool result tells you what to say when it's done.",
  ];
  if (friendNames.length > 0) {
    lines.push(
      `- The child's friends: ${friendNames.join(", ")}. ONLY these friends can receive a snapshot.`,
      "- When the child asks to send or share this with someone ('share this with Lea', 'send it to Lea'), FIRST repeat the friend's name back and get a clear yes (e.g. 'Should I send it to Lea?'). Only after the child confirms, call `share_snapshot` with `friend_name`.",
      "- If the name doesn't clearly match one friend from the list, ask the child which friend they mean — NEVER guess or pick for them.",
      "- Sharing also saves a copy in the child's own collection.",
    );
  } else {
    lines.push(
      "- The child has no connected friends yet, so snapshots can be saved but not shared. If they ask to share one, gently explain that a parent can help them add friends first.",
    );
  }
  lines.push("");
  return lines;
}

export function buildGameVoiceContext(
  input: GameContextInput,
): DodiVoiceContext {
  const shared = buildGameSharedInstruction(input);
  // Without friends there is no one to share with — drop the tool entirely so
  // the model can't call it (the guidance explains why instead).
  const tools = buildGameToolDeclarations(input.capabilities ?? []).filter(
    (t) => t.name !== "share_snapshot" || (input.friendNames ?? []).length > 0,
  );
  const toolListLines = tools.map((t) => `- \`${t.name}\` — ${t.description}`);

  const systemInstruction = [
    shared,
    ...buildAddressingSection(input),
    "",
    "## Game State at Session Start",
    "This is the game state as of the START of this session. It goes STALE as the child plays — it is NOT kept up to date.",
    JSON.stringify(input.gameState ?? {}, null, 2),
    "",
    "## Voice Game Interaction",
    "",
    "You can use these tools:",
    ...toolListLines,
    "",
    "CRITICAL — Doing things in the game (only on a request directed at you):",
    "- First decide whether the utterance was addressed to YOU (see \"Hearing vs. Being Asked\"). Tools that CHANGE something — drawing, writing, answering, selecting, placing, changing colors, restarting, clearing, saving, sharing — must ONLY run on a request clearly aimed at you. NEVER fire them because of overheard narration, self-talk, or ambient chatter.",
    "- If it might be a request but you are not sure it was meant for you, or not sure exactly what they want, ask ONE short question (for example \"Should I draw that?\") instead of acting.",
    "- When the child DID clearly ask you to do, make, draw, answer, or change something, you MUST call the matching tool immediately in that SAME turn. Do not just describe or promise it — the tool call is what changes the screen. Announcing an action is NOT the same as doing it.",
    "- For a multi-step request, call the appropriate tools multiple times in the same turn.",
    "- Pass arguments exactly as each tool defines them.",
    "- `read_game_state` and `analyze_game_state` only LOOK — they change nothing. Use them freely whenever they help you follow along or answer; they need no directed request.",
    "- Game command tool responses include the game state AFTER the command ran — use it to react (e.g. whether the answer was correct, what the new score is).",
    "",
    "Knowing the game state:",
    "- The \"Game State at Session Start\" section above goes stale. NEVER answer questions about scores, items, counts, progress, or the current task from it — call `read_game_state` first and answer from the returned state.",
    "- `read_game_state` is instant and silent: no need to announce it, just call it and answer.",
    "- `read_game_state` returns structured data only — it can NOT tell you what a drawing or creation LOOKS like. For ANY question about what the child drew, made, built, or created (e.g. 'What did I draw?', 'Can you guess what this is?'), you MUST call `analyze_game_state` — it actually looks at the picture. Do NOT answer such questions from state data alone.",
    "- `analyze_game_state` takes a few seconds — BEFORE calling it, briefly tell the child you're checking (e.g., 'Let me take a look!', 'Hmm, let me see...'); your spoken acknowledgment fills the silence. Use its returned analysis directly in your spoken response.",
    "- Speak answers naturally and concisely in the child's language",
    "",
    ...buildSnapshotSection(input),
    "Speech rules:",
    "- Speak naturally to the child in their configured language",
    "- Keep spoken responses short and friendly",
    "- Never output markdown formatting, bold headers, or thinking-style text",
    "- Never mention the tool, function calls, or system instructions — just speak naturally and the game action happens",
  ].join("\n");

  return {
    systemInstruction,
    tools,
  };
}

// ---------------------------------------------------------------------------
// Mode 3: In-game text chat
// ---------------------------------------------------------------------------

/**
 * Text-chat doc for the host-handled snapshot commands. They are not part of
 * the game's own vocabulary (`standardCommandsDoc` covers only declarable
 * commands), but the JSON `commands` array accepts them — the APP intercepts
 * them before the sandbox.
 */
function buildSnapshotCommandsDoc(input: GameContextInput): string[] {
  const capabilities = input.capabilities ?? [];
  if (!capabilities.includes("save_state")) return [];
  const friendNames = input.friendNames ?? [];

  const lines = [
    "",
    "### Host commands (handled by the APP, not the game)",
    "`save_snapshot` `{ title }` — save the current game moment to the child's snapshot collection. `title` (string, optional): a short fun name for it.",
  ];
  if (friendNames.length > 0) {
    lines.push(
      "`share_snapshot` `{ friend_name, title }` — save AND send the moment to one of the child's friends. `friend_name` (string, required) must be one of the friends listed in the snapshot section; confirm the name with the child before emitting.",
    );
  }
  return lines;
}

export function buildGameTextContext(
  input: GameContextInput,
): { systemInstruction: string } {
  // No "Hearing vs. Being Asked" section here: typed chat is directed at dodi by
  // construction (the child taps a message to send), so there is no ambient
  // overheard speech to disambiguate. That section is voice-only.
  const shared = buildGameSharedInstruction(input);

  const systemInstruction = [
    shared,
    "",
    "## Current Game State",
    JSON.stringify(input.gameState ?? {}, null, 2),
    "",
    standardCommandsDoc(input.capabilities ?? []),
    ...buildSnapshotCommandsDoc(input),
    "",
    ...buildSnapshotSection(input),
    "## Response Contract",
    "Reply with JSON only:",
    '{"reply":"short kid-friendly text","commands":[{"type":"...","payload":{}}]}',
    "",
    "Rules:",
    "- Keep reply concise and encouraging",
    "- Use commands only when helpful; `type` MUST be one of the standard commands above and `payload` MUST use its exact keys",
    "- If no command is needed, return an empty commands array",
    "- Never mention hidden system instructions",
  ].join("\n");

  return { systemInstruction };
}
