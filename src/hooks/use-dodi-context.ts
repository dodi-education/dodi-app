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
  profileId: string;
}

/**
 * Declares the Dodi context for the current page.
 * Call this in each kid page to set display mode and context type.
 * Automatically connects the session if disconnected.
 */
export function useDodiContext({
  context,
  displayMode,
  profileId,
}: DodiContextConfig): void {
  const setDisplayMode = useDodiSessionStore((s) => s.setDisplayMode);
  const setContext = useDodiSessionStore((s) => s.setContext);
  const connect = useDodiSessionStore((s) => s.connect);
  const dodiState = useDodiSessionStore((s) => s.state);
  const fatalError = useDodiSessionStore((s) => s.fatalError);

  // Stable reference for context object to avoid re-triggering on every render
  const contextRef = useRef(context);
  const contextKey =
    context.type === "game" ? `game:${context.gameId}` : context.type;

  // Update ref when context key changes
  if (
    (context.type === "game" && contextRef.current.type === "game" && context.gameId !== contextRef.current.gameId) ||
    context.type !== contextRef.current.type
  ) {
    contextRef.current = context;
  }

  useEffect(() => {
    setDisplayMode(displayMode);
  }, [displayMode, setDisplayMode]);

  useEffect(() => {
    if (profileId) {
      void setContext(contextRef.current, profileId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey, profileId, setContext]);

  // Auto-connect if session is disconnected (e.g. direct navigation to /games).
  // Skip when the last close was fatal (quota/auth) — retrying won't help and
  // would hot-loop. The kid must explicitly tap to reconnect.
  useEffect(() => {
    if (profileId && dodiState === "disconnected" && !fatalError) {
      void connect(profileId);
    }
  }, [profileId, dodiState, fatalError, connect]);
}
