"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";

import { gameDebug } from "@dodi/games/debug";
import { buildSandboxSrcDoc } from "@dodi/games/sandbox-doc";
import {
  createSandboxHost,
  type GameProgressUpdate,
  type GameSandboxHandle,
  type SandboxHostEvents,
} from "@dodi/games/sandbox-host";
import type { GameGoal, GameSaveState } from "@dodi/types/games";

export type { GameProgressUpdate, GameSandboxHandle };

interface GameSandboxProps extends SandboxHostEvents {
  gameId: string;
  codeBundle: string;
  className?: string;
  /** Learning goal + success criteria delivered to the game on init. */
  goal?: GameGoal;
  /** Saved state to restore on init (snapshot play). */
  savedState?: GameSaveState;
  /** Viewer locale delivered to the game on init (resolved by `dodi.translate`). */
  locale?: string;
}

/**
 * A game in a sandboxed iframe (`allow-scripts`, never same-origin). The bridge
 * (handshake, token checks, command queue, snapshots) is the shared host in
 * `@dodi/games/sandbox-host`; this component only moves its messages.
 */
export const GameSandbox = forwardRef<GameSandboxHandle, GameSandboxProps>(
  function GameSandbox(
    { gameId, codeBundle, className, goal, savedState, locale, onMessage, onStateChange, onCommandResult, onProgress }: GameSandboxProps,
    ref,
  ) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const srcDoc = useMemo(() => buildSandboxSrcDoc(codeBundle), [codeBundle]);
    // Read inside the host at send/receive time, so identity changes never re-init the game.
    const initRef = useRef({ goal, savedState, locale });
    const eventsRef = useRef<SandboxHostEvents>({ onMessage, onStateChange, onCommandResult, onProgress });
    useEffect(() => {
      initRef.current = { goal, savedState, locale };
      eventsRef.current = { onMessage, onStateChange, onCommandResult, onProgress };
    });

    const host = useMemo(
      () =>
        createSandboxHost({
          gameId,
          post: (message) => {
            const target = iframeRef.current?.contentWindow;
            if (!target) return false;
            target.postMessage(message, "*");
            return true;
          },
          init: () => initRef.current,
          events: () => eventsRef.current,
        }),
      [gameId],
    );

    useImperativeHandle(
      ref,
      () => ({
        sendCommand: host.sendCommand,
        requestState: host.requestState,
        requestSaveState: host.requestSaveState,
        notifySuccess: host.notifySuccess,
        requestSnapshot: host.requestSnapshot,
      }),
      [host],
    );

    useEffect(() => {
      function handleMessage(event: MessageEvent): void {
        const frameWindow = iframeRef.current?.contentWindow;
        const data: unknown = event.data;
        if (
          data &&
          typeof data === "object" &&
          "type" in data &&
          typeof data.type === "string" &&
          data.type.startsWith("game:")
        ) {
          gameDebug("sandbox", `Raw message received: ${data.type} (source match: ${event.source === frameWindow})`, data);
        }
        if (!frameWindow || event.source !== frameWindow) return;
        host.receive(data);
      }

      window.addEventListener("message", handleMessage);

      // Re-send dodi:init if the game hasn't reported ready yet. This handles
      // React strict mode, where the previous cleanup killed the retry
      // interval and the game:ready reply was lost.
      if (!host.isReady() && iframeRef.current?.contentWindow) {
        gameDebug("sandbox", "Effect (re-)run: game not ready, re-sending dodi:init");
        host.sendInit();
      }

      return () => {
        window.removeEventListener("message", handleMessage);
        host.dispose();
      };
    }, [host]);

    return (
      <iframe
        ref={iframeRef}
        title="Game sandbox"
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        onLoad={host.sendInit}
        className={className}
      />
    );
  },
);
