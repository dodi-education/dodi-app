"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

import { GameToParentMessageSchema } from "@dodi/games/bridge-protocol";
import {
  createBridgeToken,
  isBridgeTokenValid,
} from "@dodi/games/bridge-protocol";
import { gameDebug, gameDebugWarn } from "@dodi/games/debug";
import type { MetricsSummary } from "@dodi/games/success";
import type {
  GameCommand,
  GameGoal,
  GameToParentMessage,
  ParentToGameMessage,
} from "@dodi/types/games";

export interface GameProgressUpdate {
  progress: number;
  progressLabel?: string;
  metrics?: MetricsSummary;
}

export interface GameSandboxHandle {
  sendCommand: (command: GameCommand) => void;
  requestState: () => void;
  /** Tell the game the success goal was met so it can celebrate. */
  notifySuccess: (payload?: { summary?: string; metrics?: MetricsSummary }) => void;
}

interface GameSandboxProps {
  gameId: string;
  codeBundle: string;
  className?: string;
  /** Learning goal + success criteria delivered to the game on init. */
  goal?: GameGoal;
  onMessage?: (message: GameToParentMessage) => void;
  onStateChange?: (state: Record<string, unknown>) => void;
  /** Called with state from command results (game:result). Use for immediate (non-debounced) state delivery. */
  onCommandResult?: (state: Record<string, unknown>) => void;
  /** Called on immediate game:progress updates (progress + standardized metrics). */
  onProgress?: (update: GameProgressUpdate) => void;
}

const SANDBOX_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; media-src 'none'; font-src 'none'";

const INIT_RETRY_INTERVAL_MS = 300;
const INIT_MAX_RETRIES = 10;

/** Inject a tiny shim before the first <script> that logs all incoming AND outgoing messages. */
function injectDebugShim(html: string): string {
  const shim = `<script>
window.addEventListener('message',function(e){
  var d=e.data;
  if(d&&typeof d==='object'&&typeof d.type==='string'){
    console.log('[iframe-shim] IN: '+d.type,d);
  }
});
// Outgoing messages can't be logged from inside the sandbox: it's origin "null",
// so reassigning the cross-origin parent.postMessage throws a SecurityError. The
// host logs the messages it receives instead (see GameSandbox onMessage).
console.log('[iframe-shim] shim active');
</script>`;
  // Insert before the first <script> in the body so it runs first
  const idx = html.indexOf("<script>");
  if (idx !== -1) {
    return html.slice(0, idx) + shim + html.slice(idx);
  }
  return html + shim;
}

function buildSandboxSrcDoc(codeBundle: string): string {
  const cspMeta = `<meta http-equiv=\"Content-Security-Policy\" content=\"${SANDBOX_CSP}\" />`;

  let doc: string;
  if (/content-security-policy/i.test(codeBundle)) {
    doc = codeBundle;
  } else if (/<head[^>]*>/i.test(codeBundle)) {
    doc = codeBundle.replace(/<head[^>]*>/i, (match) => `${match}${cspMeta}`);
  } else {
    doc = [
      "<!doctype html>",
      "<html>",
      "<head>",
      '<meta charset="utf-8" />',
      '<meta name="viewport" content="width=device-width, initial-scale=1" />',
      cspMeta,
      "</head>",
      "<body>",
      codeBundle,
      "</body>",
      "</html>",
    ].join("\n");
  }

  return injectDebugShim(doc);
}

export const GameSandbox = forwardRef<GameSandboxHandle, GameSandboxProps>(
  function GameSandbox(
    { gameId, codeBundle, className, goal, onMessage, onStateChange, onCommandResult, onProgress }: GameSandboxProps,
    ref,
  ) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const bridgeToken = useMemo(() => createBridgeToken(), []);
    const srcDoc = useMemo(() => buildSandboxSrcDoc(codeBundle), [codeBundle]);
    const gameReadyRef = useRef(false);
    const initRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pendingCommandsRef = useRef<GameCommand[]>([]);
    // Read goal from a ref inside init so changing goal identity never re-inits the game.
    const goalRef = useRef<GameGoal | undefined>(goal);
    goalRef.current = goal;

    const postEnvelope = useCallback(
      (message: ParentToGameMessage) => {
        const frame = iframeRef.current;
        if (!frame?.contentWindow) {
          gameDebugWarn("sandbox", `Cannot post ${message.type} — iframe contentWindow not available`);
          return;
        }
        gameDebug("sandbox", `Posting to iframe: ${message.type}`, message.type === "dodi:command" ? message : { type: message.type });
        frame.contentWindow.postMessage(message, "*");
      },
      [],
    );

    const clearInitRetry = useCallback(() => {
      if (initRetryRef.current) {
        clearInterval(initRetryRef.current);
        initRetryRef.current = null;
      }
    }, []);

    const sendInitMessage = useCallback(() => {
      gameReadyRef.current = false;
      pendingCommandsRef.current = [];
      clearInitRetry();

      const initPayload: ParentToGameMessage = {
        type: "dodi:init",
        token: bridgeToken,
        payload: { gameId, goal: goalRef.current },
      };

      gameDebug("sandbox", `Sending dodi:init to game ${gameId} (with retry)`);
      postEnvelope(initPayload);

      let retryCount = 0;
      initRetryRef.current = setInterval(() => {
        retryCount++;
        if (gameReadyRef.current || retryCount >= INIT_MAX_RETRIES) {
          clearInitRetry();
          if (!gameReadyRef.current) {
            gameDebugWarn("sandbox", `dodi:init — gave up after ${retryCount} retries, no game:ready received`);
          }
          return;
        }
        gameDebug("sandbox", `Retrying dodi:init (attempt ${retryCount + 1})`);
        postEnvelope(initPayload);
      }, INIT_RETRY_INTERVAL_MS);
    }, [bridgeToken, gameId, postEnvelope, clearInitRetry]);

    useImperativeHandle(
      ref,
      () => ({
        sendCommand(command: GameCommand) {
          gameDebug("sandbox", `sendCommand called:`, command);
          if (!gameReadyRef.current) {
            gameDebug("sandbox", `Game not ready — queuing command: ${command.type}`);
            pendingCommandsRef.current.push(command);
            return;
          }
          postEnvelope({
            type: "dodi:command",
            token: bridgeToken,
            payload: { command },
          });
        },
        requestState() {
          gameDebug("sandbox", "requestState called");
          postEnvelope({
            type: "dodi:get_state",
            token: bridgeToken,
          });
        },
        notifySuccess(payload) {
          gameDebug("sandbox", "notifySuccess called", payload);
          postEnvelope({
            type: "dodi:success",
            token: bridgeToken,
            payload: payload ?? {},
          });
        },
      }),
      [bridgeToken, postEnvelope],
    );

    useEffect(() => {
      function handleMessage(event: MessageEvent) {
        const data = event.data;
        // Log ALL messages from any source that look game-related
        if (data && typeof data === "object" && typeof data.type === "string" && data.type.startsWith("game:")) {
          gameDebug("sandbox", `Raw message received: ${data.type} (source match: ${event.source === iframeRef.current?.contentWindow})`, data);
        }

        const frameWindow = iframeRef.current?.contentWindow;
        if (!frameWindow || event.source !== frameWindow) return;

        const parsed = GameToParentMessageSchema.safeParse(event.data);
        if (!parsed.success) {
          gameDebugWarn("sandbox", "Schema validation FAILED for message:", event.data, "Issues:", parsed.error.issues);
          return;
        }

        const message = parsed.data;
        if (!isBridgeTokenValid(message.token, bridgeToken)) {
          gameDebugWarn("sandbox", `Invalid bridge token on message: ${message.type}`);
          return;
        }

        gameDebug("sandbox", `Received from iframe: ${message.type}`, message);

        if (message.type === "game:ready") {
          gameReadyRef.current = true;
          clearInitRetry();
          gameDebug("sandbox", "Game ready! Stopping init retries.");
          if (message.payload.state) {
            onStateChange?.(message.payload.state as Record<string, unknown>);
          }

          // Flush any commands that arrived before the game was ready
          const pending = pendingCommandsRef.current;
          if (pending.length > 0) {
            gameDebug("sandbox", `Flushing ${pending.length} queued commands`);
            pendingCommandsRef.current = [];
            for (const cmd of pending) {
              postEnvelope({
                type: "dodi:command",
                token: bridgeToken,
                payload: { command: cmd },
              });
            }
          }
        }

        if (message.type === "game:state") {
          onStateChange?.(message.payload as Record<string, unknown>);
        }

        if (message.type === "game:progress") {
          onProgress?.({
            progress: message.payload.progress,
            progressLabel: message.payload.progressLabel,
            metrics: message.payload.metrics,
          });
        }

        if (message.type === "game:result" && message.payload.state) {
          gameDebug("sandbox", `Command result (ok=${message.payload.result.ok}):`, message.payload);
          const resultState = message.payload.state as Record<string, unknown>;
          if (onCommandResult) {
            onCommandResult(resultState);
          } else {
            onStateChange?.(resultState);
          }
        }

        onMessage?.(message as GameToParentMessage);
      }

      window.addEventListener("message", handleMessage);

      // Re-send dodi:init if game hasn't reported ready yet.
      // This handles React strict mode where the previous effect cleanup
      // killed the retry interval and the game:ready response was lost.
      if (!gameReadyRef.current && iframeRef.current?.contentWindow) {
        gameDebug("sandbox", "Effect (re-)run: game not ready, re-sending dodi:init");
        sendInitMessage();
      }

      return () => {
        window.removeEventListener("message", handleMessage);
        clearInitRetry();
      };
    }, [bridgeToken, onMessage, onStateChange, onCommandResult, onProgress, clearInitRetry, sendInitMessage]);

    return (
      <iframe
        ref={iframeRef}
        title="Game sandbox"
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        onLoad={sendInitMessage}
        className={className}
      />
    );
  },
);
