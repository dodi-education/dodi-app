/**
 * A game in a sandboxed WebView, the app's counterpart of the web's iframe
 * sandbox. Same document (`buildSandboxSrcDoc`: CSP without any network, the
 * host shim) and the same bridge (`@dodi/games/sandbox-host`: handshake, token
 * checks, command queue, snapshots); only the transport differs:
 *
 * - game → app: the shim routes `parent.postMessage` to `ReactNativeWebView`
 *   (JSON) because a WebView document has no parent;
 * - app → game: a `message` event dispatched into the page.
 *
 * The page can never navigate: only the initial document loads, and nothing
 * is handed to the OS (react-native-webview opens non-whitelisted URLs with
 * `Linking`, so the whitelist allows all and the load handler refuses).
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";
import { buildSandboxSrcDoc } from "@dodi/games/sandbox-doc";
import {
  createSandboxHost,
  type GameSandboxHandle,
  type SandboxHostEvents,
} from "@dodi/games/sandbox-host";
import type { GameGoal, GameSaveState } from "@dodi/types/games";

export type { GameProgressUpdate, GameSandboxHandle } from "@dodi/games/sandbox-host";

interface GameSandboxProps extends SandboxHostEvents {
  gameId: string;
  codeBundle: string;
  /** Learning goal + success criteria delivered to the game on init. */
  goal?: GameGoal;
  /** Saved state to restore on init (snapshot play). */
  savedState?: GameSaveState;
  /** Viewer locale delivered to the game on init (resolved by `dodi.translate`). */
  locale?: string;
}

/** The only document the WebView may show: the one we hand it. */
function isInitialDocument(request: ShouldStartLoadRequest): boolean {
  return request.url === "about:blank" || request.url.startsWith("data:text/html");
}

export const GameSandbox = forwardRef<GameSandboxHandle, GameSandboxProps>(function GameSandbox(
  { gameId, codeBundle, goal, savedState, locale, onMessage, onStateChange, onCommandResult, onProgress },
  ref,
) {
  const webViewRef = useRef<WebView>(null);
  const source = useMemo(() => ({ html: buildSandboxSrcDoc(codeBundle) }), [codeBundle]);
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
          const webView = webViewRef.current;
          if (!webView) return false;
          // JSON is a valid JS expression; the page sees a plain MessageEvent.
          webView.injectJavaScript(
            `window.dispatchEvent(new MessageEvent("message",{data:${JSON.stringify(message)}}));true;`,
          );
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

  useEffect(() => () => host.dispose(), [host]);

  const handleMessage = (event: WebViewMessageEvent): void => {
    let data: unknown;
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    host.receive(data);
  };

  return (
    <WebView
      ref={webViewRef}
      source={source}
      originWhitelist={["*"]}
      onShouldStartLoadWithRequest={isInitialDocument}
      onLoadEnd={host.sendInit}
      onMessage={handleMessage}
      javaScriptEnabled
      domStorageEnabled={false}
      javaScriptCanOpenWindowsAutomatically={false}
      setSupportMultipleWindows={false}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      allowsLinkPreview={false}
      incognito
      cacheEnabled={false}
      mediaPlaybackRequiresUserAction
      allowsInlineMediaPlayback
      bounces={false}
      overScrollMode="never"
      scrollEnabled={false}
      setBuiltInZoomControls={false}
      textZoom={100}
      // A third-party view: NativeWind classes don't reach it.
      style={{ flex: 1, backgroundColor: "white" }}
    />
  );
});
