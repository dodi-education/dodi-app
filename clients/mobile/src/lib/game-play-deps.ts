/**
 * The app's deps for the shared play session (`@dodi/client-state/game-play`):
 * the vault + kid stores, the snapshots API, the play outbox and the activity
 * feed (web: lib/games/game-play-deps).
 */
import type { GamePlayDeps } from "@dodi/client-state/game-play";
import { logKidActivity } from "@dodi/client-state/kid-activity";

import { api } from "@/adapters/platform";
import { clientState } from "@/lib/client-state";
import { playSync } from "@/lib/play-sync";
import { snapshotDeps } from "@/lib/snapshots";

export function gamePlayDeps(): GamePlayDeps {
  return {
    vault: clientState.vault,
    kids: clientState.kids,
    snapshots: snapshotDeps,
    playSync,
    logActivity: (input) => logKidActivity(api, input),
  };
}
