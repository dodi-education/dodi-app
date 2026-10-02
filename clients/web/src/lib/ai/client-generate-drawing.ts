/**
 * Client-side coloring-sheet generation (E2EE): the vault-held image
 * provider/key is resolved and the image model called directly from the
 * browser (the server never sees the key). Shared logic:
 * `@dodi/client-state/game-companion`.
 */
import { NoImageModelError } from "@dodi/client-state/game-companion";
import type { DrawingStyle } from "@dodi/types/games";

import { gameGenerators } from "@/lib/ai/game-generators";

export { NoImageModelError };

/**
 * Generate a coloring-sheet outline of `subject` in the given `style` (a plain
 * 2D picture or a mandala) and return it as a `data:` URL. Throws
 * {@link NoImageModelError} when no image model is set up.
 */
export function generateDrawing(subject: string, style: DrawingStyle = "picture"): Promise<string> {
  return gameGenerators.generateDrawing(subject, style);
}
