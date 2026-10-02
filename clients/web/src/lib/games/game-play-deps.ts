/**
 * The browser's deps for the shared play session
 * (`@dodi/client-state/game-play`): the vault + kid stores, the snapshots API,
 * the play outbox and the activity feed.
 */
import type { GamePlayDeps } from "@dodi/client-state/game-play";

import { logKidActivity } from "@/lib/activities/log-activity";
import { clientState } from "@/lib/client-state";
import {
  finalizePlay,
  logGameEvent,
  recordPlayPatch,
  startPlay,
} from "@/lib/games/play-sync";
import { snapshotDeps } from "@/lib/snapshots";

export function gamePlayDeps(): GamePlayDeps {
  return {
    vault: clientState.vault,
    kids: clientState.kids,
    snapshots: snapshotDeps,
    playSync: { startPlay, recordPlayPatch, finalizePlay, logGameEvent },
    logActivity: logKidActivity,
  };
}
