/**
 * The app's dependencies for the shared parent-page flows
 * (`@dodi/client-state/kid-profile`, `kid-memory`, `personas`): the platform
 * API and this app's client-state stores. Mirrors the web's lib/parent-flow-deps.
 */
import type { GameStore } from "@dodi/client-state/game-store";
import type { KidProfileDeps } from "@dodi/client-state/kid-profile";

import { api } from "@/adapters/platform";
import { clientState } from "@/lib/client-state";

/** Every parent-page flow takes a subset of these. */
export function parentFlowDeps(): KidProfileDeps & { games: GameStore } {
  return {
    api,
    kids: clientState.kids,
    vault: clientState.vault,
    games: clientState.games,
  };
}
