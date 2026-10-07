/**
 * The app's deps for the shared snapshot flows (`@dodi/client-state/snapshots`,
 * `snapshot-transfer`, `game-play`): the platform API, the connectivity store,
 * the device's offline ciphertext cache (lists, payloads, autosave slots, and
 * autosaves parked while offline) and the shared friends layer (received rows
 * open with the kid's friend keys). Web: lib/snapshots.
 */
import {
  type SnapshotDeps,
  flushPendingAutosaves as flushPendingAutosavesWith,
  snapshotFriendsPort,
} from "@dodi/client-state/snapshots";

import { offlineCache } from "@/adapters/offline-cache";
import { api } from "@/adapters/platform";
import { clientState } from "@/lib/client-state";

export const snapshotDeps: SnapshotDeps = {
  api,
  connectivity: clientState.connectivity,
  offline: offlineCache,
  friends: snapshotFriendsPort(api),
};

/** Upload autosaves parked while offline (kid chrome: entry + back online). */
export function flushPendingAutosaves(): Promise<void> {
  return flushPendingAutosavesWith(snapshotDeps);
}
