"use client";

import { useEffect, useRef } from "react";

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

  // Stable reference for context object to avoid re-triggering on every render.
  // Snapshot sessions key on the snapshot id — two snapshots of the same game
  // are distinct sessions (different restored state).
  const gameKey = (c: DodiContext): string | null =>
    c.type === "game" ? (c.snapshotId ?? c.gameId) : null;
  const contextRef = useRef(context);
  const contextKey =
    context.type === "game" ? `game:${gameKey(context)}` : context.type;

  // Update ref when context key changes
  if (
    (context.type === "game" && contextRef.current.type === "game" && gameKey(context) !== gameKey(contextRef.current)) ||
    context.type !== contextRef.current.type
  ) {
    contextRef.current = context;
  }

  useEffect(() => {
    setDisplayMode(displayMode);
  }, [displayMode, setDisplayMode]);

  useEffect(() => {
    if (kidId) {
      void setContext(contextRef.current, kidId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey, kidId, setContext]);

  // Auto-connect if session is disconnected (e.g. direct navigation to /games).
  // Skip when the last close was fatal (quota/auth) — retrying won't help and
  // would hot-loop. The kid must explicitly tap to reconnect.
  useEffect(() => {
    if (kidId && dodiState === "disconnected" && !fatalError) {
      void connect(kidId);
    }
  }, [kidId, dodiState, fatalError, connect]);
}
