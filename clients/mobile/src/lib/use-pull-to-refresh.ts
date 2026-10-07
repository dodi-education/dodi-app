import { useCallback, useState } from "react";
import type { RefreshRegistry } from "@dodi/client-state/pull-refresh";

/**
 * Drives a native `RefreshControl` from a refresh scope: `refreshing` while
 * the registered reloads run (at least MIN_REFRESH_MS, so the spinner doesn't
 * flicker), back off once they all settled. Failures never surface here: an
 * offline pull ends the spinner and the screens' own offline UI applies.
 * The control itself comes from `useRefreshControl` (components/shared).
 */
export function usePullToRefresh(registry: RefreshRegistry | null): { refreshing: boolean; onRefresh: () => void } {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    if (!registry) return;
    setRefreshing(true);
    void registry.refresh().finally(() => setRefreshing(false));
  }, [registry]);

  return { refreshing, onRefresh };
}
