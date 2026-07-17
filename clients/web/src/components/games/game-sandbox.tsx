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
  GameSaveState,
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
  /** Ask the game for its full restorable serialization (game:save_state reply). */
  requestSaveState: () => void;
  /** Tell the game the success goal was met so it can celebrate. */
  notifySuccess: (payload?: { summary?: string; metrics?: MetricsSummary }) => void;
  /**
   * Capture the current game surface as a data URL. With `preferGameCapture`
   * the game's own `get_snapshot` implementation is asked first (best fidelity
   * for canvas games); the host-injected shim capture is the universal
   * fallback. Resolves null when both fail (never rejects).
   */
  requestSnapshot: (opts?: { preferGameCapture?: boolean }) => Promise<string | null>;
}

interface GameSandboxProps {
  gameId: string;
  codeBundle: string;
  className?: string;
  /** Learning goal + success criteria delivered to the game on init. */
  goal?: GameGoal;
  /** Saved state to restore on init (snapshot play). */
  savedState?: GameSaveState;
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
/** How long each snapshot capture attempt (game-implemented or shim) may take. */
const SNAPSHOT_TIMEOUT_MS = 2500;

/**
 * Inject the host shim before the first <script>: logs all incoming messages
 * and answers `dodi:host_snapshot` with a capture of the game surface — the
 * dominant <canvas> when one covers the view, else a DOM rasterization via SVG
 * foreignObject. Fully inline (CSP: no network) and game-cooperation-free.
 */
function injectHostShim(html: string): string {
  const shim = `<script>
(function(){
  function dominantCanvas(){
    var vw=window.innerWidth,vh=window.innerHeight;
    var list=document.querySelectorAll('canvas');
    var best=null,bestArea=0;
    for(var i=0;i<list.length;i++){
      var r=list[i].getBoundingClientRect();
      var area=r.width*r.height;
      if(area>bestArea){best=list[i];bestArea=area;}
    }
    // Only trust a canvas that actually IS the game surface, not a decoration.
    if(!best||bestArea<vw*vh*0.5)return null;
    return best;
  }
  function captureCanvas(){
    try{
      var c=dominantCanvas();
      if(!c||!c.width||!c.height)return null;
      return c.toDataURL('image/png');
    }catch(e){return null;}
  }
  function captureDom(done){
    try{
      var w=document.documentElement.clientWidth||window.innerWidth;
      var h=document.documentElement.clientHeight||window.innerHeight;
      if(!w||!h)return done(null);
      var clone=document.documentElement.cloneNode(true);
      var scripts=clone.querySelectorAll('script');
      for(var i=0;i<scripts.length;i++)scripts[i].parentNode.removeChild(scripts[i]);
      var xml=new XMLSerializer().serializeToString(clone);
      var svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'">'
        +'<foreignObject width="100%" height="100%">'+xml+'</foreignObject></svg>';
      var img=new Image();
      img.onload=function(){
        try{
          var canvas=document.createElement('canvas');
          canvas.width=w;canvas.height=h;
          var ctx=canvas.getContext('2d');
          ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);
          ctx.drawImage(img,0,0);
          done(canvas.toDataURL('image/png'));
        }catch(e){done(null);}
      };
      img.onerror=function(){done(null);};
      img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
    }catch(e){done(null);}
  }
  window.addEventListener('message',function(e){
    var d=e.data;
    if(!d||typeof d!=='object'||typeof d.type!=='string')return;
    console.log('[iframe-shim] IN: '+d.type,d);
    if(d.type!=='dodi:host_snapshot')return;
    var reply=function(snapshot){
      parent.postMessage({type:'game:event',token:d.token,payload:{event:'host_snapshot',snapshot:snapshot}},'*');
    };
    var fromCanvas=captureCanvas();
    if(fromCanvas)return reply(fromCanvas);
    captureDom(reply);
  });
  // Outgoing messages can't be logged from inside the sandbox: it's origin "null",
  // so reassigning the cross-origin parent.postMessage throws a SecurityError. The
  // host logs the messages it receives instead (see GameSandbox onMessage).
  console.log('[iframe-shim] shim active');
})();
</script>`;
  // Insert before the first <script> in the body so it runs first
  const idx = html.indexOf("<script>");
  if (idx !== -1) {
    return html.slice(0, idx) + shim + html.slice(idx);
  }
  return html + shim;
}

export function buildSandboxSrcDoc(codeBundle: string): string {
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

  return injectHostShim(doc);
}

export const GameSandbox = forwardRef<GameSandboxHandle, GameSandboxProps>(
  function GameSandbox(
    { gameId, codeBundle, className, goal, savedState, onMessage, onStateChange, onCommandResult, onProgress }: GameSandboxProps,
    ref,
  ) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const bridgeToken = useMemo(() => createBridgeToken(), []);
    const srcDoc = useMemo(() => buildSandboxSrcDoc(codeBundle), [codeBundle]);
    const gameReadyRef = useRef(false);
    const initRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pendingCommandsRef = useRef<GameCommand[]>([]);
    // Pending requestSnapshot resolver — fed by game:event snapshot/host_snapshot.
    const snapshotResolverRef = useRef<((snapshot: string | null) => void) | null>(null);
    // Read goal/savedState from refs inside init so identity changes never re-init the game.
    const goalRef = useRef<GameGoal | undefined>(goal);
    goalRef.current = goal;
    const savedStateRef = useRef<GameSaveState | undefined>(savedState);
    savedStateRef.current = savedState;

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
        payload: { gameId, goal: goalRef.current, savedState: savedStateRef.current },
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

    // One capture attempt: ask the game (get_snapshot command) or the shim
    // (dodi:host_snapshot), then wait for the matching game:event reply.
    const requestSnapshotOnce = useCallback(
      (kind: "game" | "host") =>
        new Promise<string | null>((resolve) => {
          let settled = false;
          const finish = (snapshot: string | null): void => {
            if (settled) return;
            settled = true;
            if (snapshotResolverRef.current === finish) snapshotResolverRef.current = null;
            resolve(snapshot);
          };
          // A newer request supersedes any stalled one.
          snapshotResolverRef.current?.(null);
          snapshotResolverRef.current = finish;
          if (kind === "game") {
            postEnvelope({
              type: "dodi:command",
              token: bridgeToken,
              payload: { command: { type: "get_snapshot" } },
            });
          } else {
            postEnvelope({ type: "dodi:host_snapshot", token: bridgeToken });
          }
          setTimeout(() => finish(null), SNAPSHOT_TIMEOUT_MS);
        }),
      [bridgeToken, postEnvelope],
    );

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
        requestSaveState() {
          gameDebug("sandbox", "requestSaveState called");
          postEnvelope({
            type: "dodi:get_save_state",
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
        async requestSnapshot(opts) {
          gameDebug("sandbox", "requestSnapshot called", opts);
          if (opts?.preferGameCapture) {
            const viaGame = await requestSnapshotOnce("game");
            if (viaGame) return viaGame;
          }
          return requestSnapshotOnce("host");
        },
      }),
      [bridgeToken, postEnvelope, requestSnapshotOnce],
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

        if (
          message.type === "game:event" &&
          (message.payload.event === "snapshot" || message.payload.event === "host_snapshot")
        ) {
          const resolver = snapshotResolverRef.current;
          if (resolver) {
            const snapshot = (message.payload as Record<string, unknown>).snapshot;
            resolver(typeof snapshot === "string" && snapshot ? snapshot : null);
          }
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
