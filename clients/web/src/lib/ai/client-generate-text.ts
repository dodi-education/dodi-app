/**
 * Client-side in-game text generation (E2EE). When a kid asks dodi for new game
 * content (a story, questions, word lists), this resolves the vault-held
 * thinking provider/key, generates one coherent fill for the game's declared
 * content slots directly from the browser (the server never sees the key or
 * the content), and returns the slot map the sandbox receives as
 * `set_generated_text { slots }`. Mirrors `client-generate-drawing.ts`.
 */
import { createClientThinkingProvider } from "@dodi/ai/client-thinking";
import {
  buildGameContentPrompt,
  parseGeneratedSlots,
  type ContentSlot,
} from "@dodi/ai/game-content";
import {
  calculateChildAge,
  getLanguageDisplayName,
} from "@dodi/ai/dodi-context";
import { resolveClientThinking } from "@/lib/ai/resolve-client-thinking";
import { reportUsage } from "@/lib/usage/report-usage";
import { useKidStore } from "@/stores/kid-store";

export class NoThinkingModelError extends Error {
  constructor() {
    super("No thinking model configured");
    this.name = "NoThinkingModelError";
  }
}

export interface GenerateGameTextParams {
  kidId: string;
  /** null for snapshot sessions — usage rows FK `games`. */
  gameId: string | null;
  /** Dodi's request: topic, difficulty, the child's wishes. */
  request: string;
  /** The game's currently declared content slots (already parsed/capped). */
  slots: ContentSlot[];
  gameTitle: string;
  gameDescription?: string;
}

/**
 * Generate text for every declared slot in one coherent generation and return
 * the validated `{ slotId: text }` map. Throws {@link NoThinkingModelError}
 * when no thinking model is set up; rethrows provider/validation failures.
 */
export async function generateGameText(
  params: GenerateGameTextParams,
): Promise<Record<string, string>> {
  const kid = await useKidStore.getState().loadOne(params.kidId);
  if (!kid) throw new Error("Kid not found");

  const thinking = await resolveClientThinking();
  if (!thinking) throw new NoThinkingModelError();

  const provider = createClientThinkingProvider(
    thinking.provider,
    thinking.apiKey,
    thinking.model,
    (usage) =>
      reportUsage({
        eventType: "game_text_generation",
        kidId: params.kidId,
        gameId: params.gameId,
        provider: thinking.provider,
        model: thinking.model,
        usage,
        meta: {
          promptChars: params.request.length,
        },
      }),
  );

  const { system, prompt } = buildGameContentPrompt({
    request: params.request,
    slots: params.slots,
    gameTitle: params.gameTitle,
    gameDescription: params.gameDescription,
    childAge: calculateChildAge(kid.birthdate),
    languageName: getLanguageDisplayName(kid.language),
  });

  const raw = await provider.generateJson(system, prompt);
  return parseGeneratedSlots(raw, params.slots);
}
