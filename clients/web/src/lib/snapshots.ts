/**
 * The browser's snapshots API: shared logic `@dodi/client-state/snapshots`
 * bound to the platform API, the IndexedDB offline cache and the friends layer
 * (received rows open with the kid's friend keys). The app-facing names stay
 * unchanged; see the core module for the E2EE model.
 */
import {
  type CreateOwnSnapshotInput,
  type ShareFriendResolution,
  type ShareSnapshotInput,
  type SnapshotDeps,
  type SnapshotDetailView,
  type SnapshotView,
  type UpsertAutosaveInput,
  createOwnSnapshot as createOwnSnapshotWith,
  deleteSnapshot as deleteSnapshotWith,
  fetchAutosaveSnapshot as fetchAutosaveSnapshotWith,
  fetchSnapshot as fetchSnapshotWith,
  fetchSnapshots as fetchSnapshotsWith,
  flushPendingAutosaves as flushPendingAutosavesWith,
  markSnapshotViewed as markSnapshotViewedWith,
  prefetchSnapshotPayloadsForOffline as prefetchWith,
  resolveFriendForShare as resolveFriendForShareWith,
  shareSnapshotWithFriend as shareSnapshotWithFriendWith,
  upsertAutosaveSnapshot as upsertAutosaveSnapshotWith,
} from "@dodi/client-state/snapshots";
import type { Kid } from "@dodi/types/database";
import type { VaultSession } from "@dodi/vault";

import { dodi } from "@/lib/api";
import { clientState } from "@/lib/client-state";
import { decodeView, ensureFriendKeys, fetchFriends } from "@/lib/friends";
import { offlineCache } from "@/lib/offline/offline-cache";

export {
  SnapshotsError,
  decodeSnapshotInfo,
  decodeSnapshotPayload,
  type CreateOwnSnapshotInput,
  type DecodedSnapshotPayload,
  type ShareFriendResolution,
  type ShareSnapshotInput,
  type SnapshotDetailView,
  type SnapshotView,
  type UpsertAutosaveInput,
} from "@dodi/client-state/snapshots";

/** The browser's deps for every shared snapshot flow. */
export const snapshotDeps: SnapshotDeps = {
  // Resolved per call, so tests can swap the transport.
  api: { request: (path, init) => dodi.request(path, init) },
  connectivity: clientState.connectivity,
  offline: offlineCache,
  friends: {
    ensureFriendKeys,
    listFriends: async (kid, keys, session) =>
      (await fetchFriends(kid.id)).map((view) => {
        const decoded = decodeView(view, keys, session);
        return {
          friendshipId: decoded.id,
          counterpartKidId: view.counterpartKidId,
          status: view.status,
          name: decoded.name,
          nickname: decoded.nickname,
          counterpartKemPublicKey: view.counterpartKemPublicKey,
        };
      }),
  },
};

export function fetchSnapshots(
  kidId: string,
  opts?: { includeAutosave?: boolean },
): Promise<SnapshotView[]> {
  return fetchSnapshotsWith(snapshotDeps, kidId, opts);
}

export function fetchSnapshot(id: string): Promise<SnapshotDetailView> {
  return fetchSnapshotWith(snapshotDeps, id);
}

export function prefetchSnapshotPayloadsForOffline(views: SnapshotView[]): Promise<void> {
  return prefetchWith(snapshotDeps, views);
}

export function createOwnSnapshot(
  input: CreateOwnSnapshotInput,
): Promise<{ id: string; createdAt: string }> {
  return createOwnSnapshotWith(snapshotDeps, input);
}

export function shareSnapshotWithFriend(input: ShareSnapshotInput): Promise<{ id: string }> {
  return shareSnapshotWithFriendWith(snapshotDeps, input);
}

export function upsertAutosaveSnapshot(
  input: UpsertAutosaveInput,
): Promise<{ id: string } | { id: null; pending: true }> {
  return upsertAutosaveSnapshotWith(snapshotDeps, input);
}

export function fetchAutosaveSnapshot(
  kidId: string,
  gameId: string,
): Promise<SnapshotDetailView | null> {
  return fetchAutosaveSnapshotWith(snapshotDeps, kidId, gameId);
}

export function flushPendingAutosaves(): Promise<void> {
  return flushPendingAutosavesWith(snapshotDeps);
}

export function deleteSnapshot(id: string): Promise<{ ok: boolean }> {
  return deleteSnapshotWith(snapshotDeps, id);
}

export function markSnapshotViewed(id: string): Promise<{ ok: boolean }> {
  return markSnapshotViewedWith(snapshotDeps, id);
}

export function resolveFriendForShare(
  kid: Kid,
  session: VaultSession,
  rawName: string,
): Promise<ShareFriendResolution> {
  return resolveFriendForShareWith(snapshotDeps, kid, session, rawName);
}
