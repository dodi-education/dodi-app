/**
 * The browser's dependencies for the shared games-library flows
 * (`@dodi/client-state/game-library`, `game-sharing`, `game-transfer`,
 * `game-publication`): the platform API and this app's client-state stores.
 */
import type { PublicationDeps } from "@dodi/client-state/game-publication";

import { dodi } from "@/lib/api";
import { clientState } from "@/lib/client-state";

/** Every games flow takes a subset of these. */
export function gameFlowDeps(): PublicationDeps {
  return {
    api: dodi,
    games: clientState.games,
    gameCrypto: clientState.gameCrypto,
    vault: clientState.vault,
    account: clientState.account,
  };
}
