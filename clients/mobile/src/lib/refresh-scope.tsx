/**
 * Pull-to-refresh scopes (`@dodi/client-state/pull-refresh`): the parent shell
 * and the kid chrome each hold one, and whatever a screen shows registers its
 * reload there under a key (`useRefreshOnPull`). A pull on the screen's scroll
 * view (ShellContent's `onRefresh`, the kid chrome's page) reloads everything
 * registered at once. Browsers have their own reload, so this is app-only.
 */
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { createRefreshRegistry, type Refresher, type RefreshRegistry } from "@dodi/client-state/pull-refresh";

import { reconnectProbe } from "@/lib/client-state";

const RefreshScopeContext = createContext<RefreshRegistry | null>(null);

/**
 * A registry for one scope. A pull first checks for the network when the app
 * believes it's offline (the reconnect probe), so coming back online flushes
 * the outboxes and re-warms the offline cache right away.
 */
export function useNewRefreshRegistry(): RefreshRegistry {
  const [registry] = useState(() => createRefreshRegistry({ onRefresh: () => reconnectProbe.check() }));
  return registry;
}

export function RefreshScope({ registry, children }: { registry: RefreshRegistry; children: ReactNode }) {
  return <RefreshScopeContext.Provider value={registry}>{children}</RefreshScopeContext.Provider>;
}

/** The nearest scope's registry (null outside the parent shell and the kid chrome). */
export function useRefreshScope(): RefreshRegistry | null {
  return useContext(RefreshScopeContext);
}

/**
 * Reload `refresher` when the screen is pulled. Parts showing the same data
 * use the same `key` and it reloads once. The latest `refresher` runs (no
 * re-registration on every render); null registers nothing. It should reload
 * past the caches (`load(true)`) and may reject: failures are swallowed.
 */
export function useRefreshOnPull(key: string, refresher: Refresher | null | undefined): void {
  const registry = useRefreshScope();
  const latest = useRef(refresher);
  useEffect(() => {
    latest.current = refresher;
  });
  const isActive = refresher != null;
  useEffect(() => {
    if (!registry || !isActive) return;
    return registry.register(key, () => latest.current?.());
  }, [registry, key, isActive]);
}
