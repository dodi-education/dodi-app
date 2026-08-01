/**
 * Prompt + output validation for the client-side `generate_text` game command:
 * a game declares fillable content slots in its `game:state`
 * (`state.contentSlots: [{ id, description }]`), Dodi triggers `generate_text`
 * with a request, and the app fills ALL declared slots in one coherent
 * generation via the account's thinking provider, delivered back to the game
 * as `set_generated_text { slots }`. Pure and dependency-free so it can be
 * unit-tested and shared (browser-safe, mirrors `image-providers/coloring-prompt.ts`).
 */

/** A fillable text slot a game declares in its state. */
export interface ContentSlot {
  id: string;
  /** What belongs in the slot: content, format, rough length. */
  description: string;
}

export interface GameContentPromptInput {
  /** Dodi's tool-call request (topic, difficulty, the child's wishes). */
  request: string;
  /** The game's currently declared slots (see {@link parseContentSlots}). */
  slots: ContentSlot[];
  gameTitle: string;
  gameDescription?: string;
  /** Whole-years age from `calculateChildAge`; null when unknown. */
  childAge: number | null;
  /** Display name of the child's language, e.g. "German". */
  languageName: string;
}

export interface GameContentPrompt {
  system: string;
  prompt: string;
}

export const MAX_CONTENT_SLOTS = 16;
export const MAX_SLOT_DESCRIPTION_CHARS = 500;
export const MAX_SLOT_TEXT_CHARS = 4000;
export const MAX_REQUEST_CHARS = 1000;

/**
 * Read `state.contentSlots` defensively from an untrusted game state: keep only
 * entries with a non-empty string id, coerce missing descriptions to "", trim,
 * dedupe ids, and cap slot count + description length. Returns `[]` when the
 * game declares no usable slots.
 */
export function parseContentSlots(gameState: Record<string, unknown>): ContentSlot[] {
  const raw = gameState.contentSlots;
  if (!Array.isArray(raw)) return [];

  const slots: ContentSlot[] = [];
  const seenIds = new Set<string>();
  for (const entry of raw) {
    if (slots.length >= MAX_CONTENT_SLOTS) break;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id || seenIds.has(id)) continue;
    const description =
      typeof record.description === "string"
        ? record.description.replace(/\s+/g, " ").trim().slice(0, MAX_SLOT_DESCRIPTION_CHARS)
        : "";
    seenIds.add(id);
    slots.push({ id, description });
  }
  return slots;
}

/** Keep the request a single clean line of bounded length for the prompt. */
export function sanitizeContentRequest(request: string): string {
  return request
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_REQUEST_CHARS);
}

/**
 * Build the system + user prompt for one multi-slot content generation. The
 * output contract is a single JSON object `{"slots": {"<id>": "<text>"}}` —
 * the word "JSON" must stay in the system prompt (the xAI client requires it
 * for JSON mode).
 */
export function buildGameContentPrompt(input: GameContentPromptInput): GameContentPrompt {
  const ageLine = input.childAge
    ? `The reader is a ${input.childAge}-year-old child; content, vocabulary and sentence length must suit that age.`
    : "The reader is a young child; keep content, vocabulary and sentence length simple.";

  const system = [
    "You write in-game text content for a children's learning game.",
    ageLine,
    "Everything must be gentle, positive and age-appropriate: no violence, no scary or adult themes, no brand names, no links.",
    `Write ALL content in ${input.languageName}.`,
    "All slots belong to ONE coherent generation: if one slot is a story and other slots are questions, the questions must be about that exact story.",
    "Each slot's description defines what belongs in it (content, format, rough length); follow it precisely. Plain text only unless a slot's description says otherwise.",
    'Respond with a single JSON object: {"slots": {"<slotId>": "<text>", ...}} containing EXACTLY one entry for every listed slot id. No other keys, no markdown, no code fences.',
  ].join("\n");

  const request = sanitizeContentRequest(input.request);
  const prompt = [
    "## Game",
    input.gameDescription ? `${input.gameTitle}: ${input.gameDescription}` : input.gameTitle,
    "",
    "## Content slots to fill",
    ...input.slots.map((slot) => (slot.description ? `- ${slot.id}: ${slot.description}` : `- ${slot.id}`)),
    "",
    "## Request",
    request || "Fill the slots with fitting content.",
  ].join("\n");

  return { system, prompt };
}

/**
 * Validate a `generateJson` result against the declared slots. Strict fill:
 * every declared slot must be present and non-empty (a game must never
 * half-update), unknown keys are dropped, numbers/booleans are stringified,
 * texts are trimmed and capped at {@link MAX_SLOT_TEXT_CHARS}. Throws on a
 * missing slot or a malformed result.
 */
export function parseGeneratedSlots(
  raw: Record<string, unknown>,
  slots: ContentSlot[],
): Record<string, string> {
  const rawSlots = raw.slots;
  if (!rawSlots || typeof rawSlots !== "object" || Array.isArray(rawSlots)) {
    throw new Error("Generated content has no slots object");
  }

  const source = rawSlots as Record<string, unknown>;
  const filled: Record<string, string> = {};
  for (const slot of slots) {
    const value = source[slot.id];
    const text =
      typeof value === "string"
        ? value.trim()
        : typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : "";
    if (!text) {
      throw new Error(`Generated content is missing slot '${slot.id}'`);
    }
    filled[slot.id] = text.slice(0, MAX_SLOT_TEXT_CHARS);
  }
  return filled;
}
