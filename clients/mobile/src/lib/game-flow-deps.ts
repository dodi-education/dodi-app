/**
 * The app's dependencies for the shared games-library flows
 * (`@dodi/client-state/game-library`, `game-sharing`, `game-transfer`,
 * `game-publication`): the platform API and this app's client-state stores.
 * Mirrors the web's lib/games/game-flow-deps.
 */
import type { PublicationDeps, TranslateForPublication } from "@dodi/client-state/game-publication";
import { createPublicationTranslator } from "@dodi/client-state/publication-translation";
import { createTelemetry } from "@dodi/client-state/telemetry";

import { api } from "@/adapters/platform";
import { clientState } from "@/lib/client-state";

/** Every games flow takes a subset of these. */
export function gameFlowDeps(): PublicationDeps {
  return {
    api,
    games: clientState.games,
    gameCrypto: clientState.gameCrypto,
    vault: clientState.vault,
    account: clientState.account,
  };
}

const telemetry = createTelemetry(api);

/**
 * The publish-translate step on this device: the account's thinking model and
 * vault key (never sent to the server), usage reported like the web's.
 */
export const translateGameForPublication: TranslateForPublication = createPublicationTranslator({
  resolveThinking: () => clientState.execution.resolveThinking(),
  reportUsage: (report) => telemetry.reportUsage(report),
});
