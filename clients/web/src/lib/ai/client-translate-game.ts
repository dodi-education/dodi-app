/**
 * Client-side publish-translate step (E2EE/BYOK): the shared implementation
 * (`@dodi/client-state/publication-translation`) bound to the browser's
 * execution resolver and usage telemetry. The server never sees the key.
 */
import type { Game } from "@dodi/types/database";
import {
  type ListingText,
  type PublicationTranslationResult,
  BundleTooLargeError,
  MissingTranslationsError,
  translateGameForPublication as translateShared,
} from "@dodi/client-state/publication-translation";

import { resolveClientThinking } from "@/lib/ai/resolve-client-thinking";
import { reportUsage } from "@/lib/usage/report-usage";

// The listing shapes and errors are shared; re-exported under their old home.
export type { ListingText, PublicationTranslationResult };
export { BundleTooLargeError, MissingTranslationsError };

/**
 * Translate a decrypted game into every platform locale for publication (see
 * the shared module for the error contract and the paid-work skipping).
 */
export function translateGameForPublication(
  game: Game,
  options: { knownListings?: Record<string, ListingText> } = {},
): Promise<PublicationTranslationResult> {
  return translateShared(
    { resolveThinking: resolveClientThinking, reportUsage: (report) => reportUsage(report) },
    game,
    options,
  );
}
