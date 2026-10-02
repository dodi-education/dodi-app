/**
 * The app's deps for the shared snapshot flows (`@dodi/client-state/snapshots`,
 * `snapshot-transfer`, `game-play`): the platform API, the connectivity store
 * and the shared friends layer (received rows open with the kid's friend
 * keys). No offline ciphertext cache yet (roadmap phase 6), so autosaves are
 * never parked: the flush is a no-op until then.
 */
import {
  NO_SNAPSHOT_OFFLINE_CACHE,
  type SnapshotDeps,
  flushPendingAutosaves as flushPendingAutosavesWith,
  snapshotFriendsPort,
} from "@dodi/client-state/snapshots";

import { api } from "@/adapters/platform";
import { clientState } from "@/lib/client-state";

export const snapshotDeps: SnapshotDeps = {
  api,
  connectivity: clientState.connectivity,
  offline: NO_SNAPSHOT_OFFLINE_CACHE,
  friends: snapshotFriendsPort(api),
};

/** Upload autosaves parked while offline (kid chrome: entry + back online). */
export function flushPendingAutosaves(): Promise<void> {
  return flushPendingAutosavesWith(snapshotDeps);
}
