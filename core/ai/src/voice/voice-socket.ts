/**
 * The realtime socket the voice clients speak through, as a small injectable
 * port. Browsers and React Native both ship a WHATWG-style `WebSocket` global
 * (same constructor, same `onopen`/`onmessage`/`onerror`/`onclose`), so
 * `createWebSocketFactory()` adapts whichever one is present; tests pass a
 * fake factory instead.
 *
 * Frames are decoded without `Blob`/`FileReader` (absent in Hermes): the socket
 * asks for `arraybuffer` binary frames and UTF-8-decodes them here.
 */

/** `WebSocket.OPEN` — spelled out so no global is needed to compare against. */
export const SOCKET_OPEN = 1;

export interface VoiceSocketClose {
  code: number;
  reason: string;
  wasClean: boolean;
}

export interface VoiceSocketHandlers {
  onOpen(): void;
  /** One server frame, already decoded to text. */
  onMessage(text: string): void;
  onError(): void;
  onClose(event: VoiceSocketClose): void;
}

export interface VoiceSocket {
  isOpen(): boolean;
  send(text: string): void;
  close(): void;
}

/** Opens a socket to `url` (optionally with subprotocols) wired to `handlers`. */
export type VoiceSocketFactory = (
  url: string,
  protocols: string[] | undefined,
  handlers: VoiceSocketHandlers,
) => VoiceSocket;

/** What the voice clients need from the platform besides the socket. */
export interface VoiceTransport {
  socket: VoiceSocketFactory;
  /** For the xAI ephemeral-token mint (called with the vault key, device-side). */
  fetch: typeof fetch;
}

/** The subset of the WHATWG WebSocket both browsers and React Native provide. */
export interface WebSocketLike {
  readonly readyState: number;
  binaryType: string;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code: number; reason: string; wasClean?: boolean }) => void) | null;
  send(data: string): void;
  close(): void;
}

export type WebSocketConstructorLike = new (url: string, protocols?: string[]) => WebSocketLike;

/** Decode UTF-8 bytes without relying on TextDecoder (missing in some Hermes builds). */
export function decodeUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder("utf-8").decode(bytes);
  }
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i++];
    let cp: number;
    if (b0 < 0x80) {
      cp = b0;
    } else if (b0 >= 0xc0 && b0 < 0xe0) {
      cp = ((b0 & 0x1f) << 6) | (bytes[i++] & 0x3f);
    } else if (b0 >= 0xe0 && b0 < 0xf0) {
      cp = ((b0 & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    } else {
      cp =
        ((b0 & 0x07) << 18) |
        ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
    }
    out += String.fromCodePoint(cp);
  }
  return out;
}

/** A string / ArrayBuffer / typed-array frame as text; null for anything else. */
export function frameToTextSync(data: unknown): string | null {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return decodeUtf8(new Uint8Array(data));
  if (ArrayBuffer.isView(data)) {
    return decodeUtf8(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }
  return null;
}

/**
 * A frame's payload as text: strings pass through, ArrayBuffer / typed-array
 * frames are UTF-8 decoded, and a Blob-like (`text()`) is read as a fallback
 * for runtimes that ignore `binaryType`.
 */
export async function frameToText(data: unknown): Promise<string> {
  const text = frameToTextSync(data);
  if (text !== null) return text;
  if (data && typeof data === "object" && "text" in data && typeof data.text === "function") {
    const text: unknown = await (data as { text: () => Promise<unknown> }).text();
    return typeof text === "string" ? text : "";
  }
  return "";
}

function globalWebSocket(): WebSocketConstructorLike {
  const ctor = (globalThis as { WebSocket?: unknown }).WebSocket;
  if (typeof ctor !== "function") {
    throw new Error("No WebSocket implementation available");
  }
  return ctor as WebSocketConstructorLike;
}

/**
 * Socket factory over a WHATWG WebSocket constructor (defaults to the global
 * one, resolved per connect so a later-installed implementation is honored).
 * Frames are delivered in arrival order even when decoding is async.
 */
export function createWebSocketFactory(ctor?: WebSocketConstructorLike): VoiceSocketFactory {
  return (url, protocols, handlers) => {
    const Ctor = ctor ?? globalWebSocket();
    const ws = protocols ? new Ctor(url, protocols) : new Ctor(url);
    ws.binaryType = "arraybuffer";
    // Binary frames decode synchronously (ArrayBuffer); only the Blob fallback is
    // async. Text frames are delivered synchronously unless a decode is still
    // pending ahead of them, in which case they queue behind it.
    let queue: Promise<void> = Promise.resolve();
    let pendingDecodes = 0;

    const deliver = (data: unknown): void => {
      const text = frameToTextSync(data);
      if (text !== null && pendingDecodes === 0) {
        handlers.onMessage(text);
        return;
      }
      pendingDecodes++;
      queue = queue
        .then(() => text ?? frameToText(data))
        .then(
          (decoded) => {
            pendingDecodes--;
            handlers.onMessage(decoded);
          },
          (err: unknown) => {
            pendingDecodes--;
            console.warn("[voice-socket] frame dropped: could not decode", err);
          },
        );
    };

    ws.onopen = () => handlers.onOpen();
    ws.onmessage = (event) => deliver(event.data);
    ws.onerror = () => handlers.onError();
    ws.onclose = (event) =>
      handlers.onClose({
        code: event.code,
        reason: event.reason || "",
        wasClean: event.wasClean ?? false,
      });

    return {
      isOpen: () => ws.readyState === SOCKET_OPEN,
      send: (text) => ws.send(text),
      close: () => ws.close(),
    };
  };
}

/** The platform's default transport: global WebSocket + global fetch. */
export function defaultVoiceTransport(): VoiceTransport {
  return {
    socket: createWebSocketFactory(),
    // Resolved per call so a fetch installed later (polyfills, test doubles) is honored.
    fetch: (input, init) => fetch(input, init),
  };
}
