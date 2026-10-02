"use client";

import { useEffect, useState } from "react";

import { companionContextKey } from "@dodi/client-state/companion-session";

import { useOnline } from "@/hooks/use-online";
import {
  useDodiSessionStore,
  type DodiContext,
  type DodiDisplayMode,
} from "@/stores/dodi-session-store";

interface DodiContextConfig {
  context: DodiContext;
  displayMode: DodiDisplayMode;
  kidId: string;
}

/**
 * Declares the Dodi context for the current page.
 * Call this in each kid page to set display mode and context type.
 * Automatically connects the session if disconnected.
 */
export function useDodiContext({
  context,
  displayMode,
  kidId,
}: DodiContextConfig): void {
  const setDisplayMode = useDodiSessionStore((s) => s.setDisplayMode);
  const setContext = useDodiSessionStore((s) => s.setContext);
  const connect = useDodiSessionStore((s) => s.connect);
  const dodiState = useDodiSessionStore((s) => s.state);
  const fatalError = useDodiSessionStore((s) => s.fatalError);
  const isOnline = useOnline();

  // Stable context object per context key, so a new object for the same
  // context doesn't re-trigger the switch on every render. Snapshot sessions
  // key on the snapshot id — two snapshots of the same game are distinct
  // sessions (different restored state). Re-derived during render when the key
  // changes (React's "store information from previous renders" pattern).
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
    if (kidId) {
      void setContext(stableContext, kidId);
    }
  }, [stableContext, kidId, setContext]);

  // Auto-connect if session is disconnected (e.g. direct navigation to /games).
  // Skip when the last close was fatal (quota/auth) — retrying won't help and
  // would hot-loop. The kid must explicitly tap to reconnect. Skip while
  // offline; the `isOnline` flip re-runs the effect, so regaining
  // connectivity reconnects automatically.
  useEffect(() => {
    if (kidId && dodiState === "disconnected" && !fatalError && isOnline) {
      void connect(kidId);
    }
  }, [kidId, dodiState, fatalError, isOnline, connect]);
}
