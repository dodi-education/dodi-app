/**
 * The kid view's offline warm-up, shared by the web and the app: pull the
 * active kid's games and snapshots once per session (and again on every
 * offline→online transition) so their ciphertext lands in the device's offline
 * cache, even when the kid never opens those tabs online.
 *
 * The stores do the caching: the game store and the snapshot fetches write
 * through to the offline cache, and the snapshot collection prefetches payloads
 * for replay. Cache-first + single-flight in the stores make this a no-op when
 * a tab loaded the data first.
 */
import { type ConnectivityStore, onBackOnline } from "./connectivity-store";
import type { GameStore } from "./game-store";
import {
  type SnapshotDeps,
  fetchSnapshots,
  prefetchSnapshotPayloadsForOffline,
} from "./snapshots";

export interface OfflineWarmupDeps {
  games: GameStore;
  snapshots: SnapshotDeps;
  connectivity: ConnectivityStore;
  /**
   * Warm the platform's image cache for a system game's path-based preview
   * ("/images/game-previews/…"): those only load when the library renders.
   * Family games carry inline `data:` previews and need nothing. Web: a fetch
   * the service worker caches; app: the native image cache.
   */
  prefetchPreviewImage(path: string): Promise<unknown>;
}

/** One warm-up pass for a kid (skipped while offline). Never throws. */
export function warmKidForOffline(deps: OfflineWarmupDeps, kidId: string): void {
  if (!deps.connectivity.getState().isOnline) return;
  void deps.games
    .getState()
    .loadForKid(kidId)
    .then((games) => {
      for (const game of games) {
        const preview = game.preview_image;
        if (preview?.startsWith("/")) void deps.prefetchPreviewImage(preview).catch(() => {});
      }
    })
    .catch(() => {});
  void fetchSnapshots(deps.snapshots, kidId)
    .then((views) => prefetchSnapshotPayloadsForOffline(deps.snapshots, views))
    .catch(() => {});
}

/**
 * Warm now and on every offline→online transition (the kid chrome, per active
 * kid). Returns the unsubscribe.
 */
export function startOfflineWarmup(deps: OfflineWarmupDeps, kidId: string): () => void {
  const warm = (): void => warmKidForOffline(deps, kidId);
  warm();
  return onBackOnline(deps.connectivity, warm);
}
