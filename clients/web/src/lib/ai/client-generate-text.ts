/**
 * Client-side in-game text generation (E2EE): one coherent fill of the game's
 * declared content slots from the vault-held thinking provider, called
 * directly from the browser (the server never sees the key or the content).
 * Shared logic: `@dodi/client-state/game-companion`.
 */
import {
  type GenerateGameTextParams,
  NoThinkingModelError,
} from "@dodi/client-state/game-companion";

import { gameGenerators } from "@/lib/ai/game-generators";

// Shared with the publish-translate step and the mobile app (one identity).
export { NoThinkingModelError };
export type { GenerateGameTextParams };

/**
 * Generate text for every declared slot in one coherent generation and return
 * the validated `{ slotId: text }` map. Throws {@link NoThinkingModelError}
 * when no thinking model is set up; rethrows provider/validation failures.
 */
export function generateGameText(
  params: GenerateGameTextParams,
): Promise<Record<string, string>> {
  return gameGenerators.generateText(params);
}
