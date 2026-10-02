import { useEffect, useState } from "react";
import { companionContextKey } from "@dodi/client-state/companion-session";

import { useConnectivityStore } from "@/lib/client-state";
import { type DodiContext, type DodiDisplayMode, useDodiSessionStore } from "@/lib/dodi-session-store";
import { useIsAppActive } from "@/lib/use-app-active";

interface DodiContextConfig {
  context: DodiContext;
  displayMode: DodiDisplayMode;
  kidId: string;
}

/**
 * Declares dodi's context for the current page (web: hooks/use-dodi-context).
 * Call it in each kid page to set the display mode and context type; it
 * connects the session when it is disconnected. In the app it also waits for
 * the foreground: backgrounding ends the session, coming back reconnects.
 */
export function useDodiContext({ context, displayMode, kidId }: DodiContextConfig): void {
  const setDisplayMode = useDodiSessionStore((s) => s.setDisplayMode);
  const setContext = useDodiSessionStore((s) => s.setContext);
  const connect = useDodiSessionStore((s) => s.connect);
  const dodiState = useDodiSessionStore((s) => s.state);
  const fatalError = useDodiSessionStore((s) => s.fatalError);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const isAppActive = useIsAppActive();

  // Stable context object per context key, so a new object for the same
  // context doesn't re-trigger the switch on every render (React's "store
  // information from previous renders" pattern). Snapshot sessions key on the
  // snapshot id.
  const contextKey = companionContextKey(context);
  const [keyedContext, setKeyedContext] = useState({ key: contextKey, context });
  if (keyedContext.key !== contextKey) {
    setKeyedContext({ key: contextKey, context });
  }
  const stableContext = keyedContext.key === contextKey ? keyedContext.context : context;

  useEffect(() => {
    setDisplayMode(displayMode);
  }, [displayMode, setDisplayMode]);

  useEffect(() => {
    if (kidId) void setContext(stableContext, kidId);
  }, [stableContext, kidId, setContext]);

  // Auto-connect while disconnected (e.g. opening /games directly). Not after
  // a fatal close (quota/auth: retrying would hot-loop; the kid taps to
  // reconnect), not offline and not in the background; the flips re-run this.
  useEffect(() => {
    if (kidId && dodiState === "disconnected" && !fatalError && isOnline && isAppActive) {
      void connect(kidId);
    }
  }, [kidId, dodiState, fatalError, isOnline, isAppActive, connect]);
}
