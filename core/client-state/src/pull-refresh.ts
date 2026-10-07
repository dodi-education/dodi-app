/**
 * Pull to refresh (the app's: browsers have their own reload). A screen and
 * the parts inside it register what they show under a key; a pull reloads all
 * of it at once, bypassing the caches, and settles when every reload has.
 *
 * - **Keyed**: two parts showing the same data (say the kid list) register the
 *   same key and it reloads once. The most recent registration for a key wins;
 *   unregistering it falls back to the one before.
 * - **Never throws**: a failed reload (offline, a server error) is swallowed.
 *   The screens keep what they had and their own offline/error UI applies.
 * - **No flicker**: a refresh lasts at least {@link MIN_REFRESH_MS}, so the
 *   spinner doesn't blink when everything comes from a warm connection.
 * - **Single-flight**: a pull while one is running joins it.
 */

/** The shortest a refresh lasts, so the spinner doesn't flicker. */
export const MIN_REFRESH_MS = 400;

/** One reload. May return a promise; its result is ignored, its failure swallowed. */
export type Refresher = () => unknown;

export interface RefreshRegistry {
  /** Adds a reload under `key`; returns its unregister. */
  register(key: string, refresher: Refresher): () => void;
  /** Runs every key's reload concurrently; resolves when all settled (never rejects). */
  refresh(): Promise<void>;
}

export interface RefreshRegistryOptions {
  minDurationMs?: number;
  /** Timer seam for tests. */
  wait?: (ms: number) => Promise<void>;
  /**
   * Runs first on every refresh, before the reloads: the app checks for the
   * network right away (reconnect probe) when it believes it is offline.
   */
  onRefresh?: () => void;
}

const defaultWait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs every reload concurrently and waits for all of them; never rejects. */
export async function settleAll(refreshers: Refresher[]): Promise<void> {
  await Promise.allSettled(
    refreshers.map(async (refresher) => {
      await refresher();
    }),
  );
}

export function createRefreshRegistry({
  minDurationMs = MIN_REFRESH_MS,
  wait = defaultWait,
  onRefresh,
}: RefreshRegistryOptions = {}): RefreshRegistry {
  // Per key, the registrations in order; the last one runs.
  const entries = new Map<string, { refresher: Refresher }[]>();
  let inFlight: Promise<void> | null = null;

  return {
    register(key, refresher) {
      const entry = { refresher };
      const stack = entries.get(key) ?? [];
      stack.push(entry);
      entries.set(key, stack);

      let isRegistered = true;
      return () => {
        if (!isRegistered) return;
        isRegistered = false;
        const current = entries.get(key);
        if (!current) return;
        const index = current.indexOf(entry);
        if (index >= 0) current.splice(index, 1);
        if (current.length === 0) entries.delete(key);
      };
    },

    refresh() {
      if (inFlight) return inFlight;
      try {
        onRefresh?.();
      } catch {
        // A failing pre-step must not stop the reloads.
      }
      const latest = [...entries.values()].map((stack) => stack[stack.length - 1].refresher);
      inFlight = Promise.all([settleAll(latest), wait(minDurationMs)])
        .then(() => {})
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
  };
}
