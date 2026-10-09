import { describe, expect, it, vi } from "vitest";

/**
 * The Gemini Live and xAI clients over an injected transport: no global
 * WebSocket, no Blob. A fake socket factory records the URL/subprotocols and
 * sent frames and lets the test play the server.
 */

import { createVoiceClient } from "./create-voice-client";
import type { VoiceClientConfig, VoiceEvent } from "./voice-client";
import {
  createWebSocketFactory,
  type VoiceSocketHandlers,
  type VoiceTransport,
  type WebSocketLike,
} from "./voice-socket";

interface FakeSocket {
  url: string;
  protocols: string[] | undefined;
  handlers: VoiceSocketHandlers;
  sent: Array<Record<string, unknown>>;
  open: boolean;
  closed: boolean;
}

function fakeTransport(fetchImpl?: typeof fetch): {
  transport: VoiceTransport;
  sockets: FakeSocket[];
} {
  const sockets: FakeSocket[] = [];
  const transport: VoiceTransport = {
    socket: (url, protocols, handlers) => {
      const sock: FakeSocket = { url, protocols, handlers, sent: [], open: true, closed: false };
      sockets.push(sock);
      return {
        isOpen: () => sock.open && !sock.closed,
        send: (text) => sock.sent.push(JSON.parse(text) as Record<string, unknown>),
        close: () => {
          sock.closed = true;
        },
      };
    },
    fetch: fetchImpl ?? (vi.fn() as unknown as typeof fetch),
  };
  return { transport, sockets };
}

const GEMINI: VoiceClientConfig = {
  provider: "gemini",
  apiKey: "AIza-secret",
  model: "gemini-live-x",
  voiceName: "Puck",
  systemInstruction: "SYS",
  tools: [{ name: "launch_game", description: "d", parameters: { type: "object" } }],
};

const XAI: VoiceClientConfig = { ...GEMINI, provider: "xai", apiKey: "xai-secret" };

describe("GeminiLiveClient", () => {
  it("opens the Live socket, sends setup on open and reports setupComplete", () => {
    const { transport, sockets } = fakeTransport();
    const events: VoiceEvent[] = [];
    const client = createVoiceClient(GEMINI, (e) => events.push(e), transport);
    client.connect();

    expect(sockets).toHaveLength(1);
    expect(sockets[0].url).toContain("BidiGenerateContent?key=AIza-secret");
    sockets[0].handlers.onOpen();
    const setup = sockets[0].sent[0].setup as Record<string, unknown>;
    expect(setup.model).toBe("models/gemini-live-x");
    expect(setup.tools).toEqual([
      {
        functionDeclarations: [
          { name: "launch_game", description: "d", parameters: { type: "object" }, behavior: "BLOCKING" },
        ],
      },
    ]);

    sockets[0].handlers.onMessage(JSON.stringify({ setupComplete: {} }));
    expect(events).toEqual([{ type: "setupComplete" }]);
  });

  it("maps server content to audio / transcription / tool / interrupt / turn events", () => {
    const { transport, sockets } = fakeTransport();
    const events: VoiceEvent[] = [];
    const client = createVoiceClient(GEMINI, (e) => events.push(e), transport);
    client.connect();
    const server = sockets[0].handlers;
    server.onMessage(JSON.stringify({ setupComplete: {} }));
    events.length = 0;

    server.onMessage(
      JSON.stringify({
        serverContent: {
          modelTurn: { parts: [{ inlineData: { data: "AAA=" } }] },
          outputTranscription: { text: "Hi" },
          inputTranscription: { text: "Hello" },
          turnComplete: true,
        },
      }),
    );
    server.onMessage(
      JSON.stringify({ toolCall: { functionCalls: [{ id: "c1", name: "next_task", args: { a: 1 } }] } }),
    );
    server.onMessage(JSON.stringify({ serverContent: { interrupted: true } }));

    expect(events).toEqual([
      { type: "audio", data: "AAA=" },
      { type: "inputTranscription", text: "Hello" },
      { type: "outputTranscription", text: "Hi" },
      { type: "turnComplete" },
      { type: "toolCall", id: "c1", name: "next_task", args: { a: 1 } },
      { type: "interrupted" },
    ]);
  });

  it("sends audio, text, context and tool responses only after setup", () => {
    const { transport, sockets } = fakeTransport();
    const client = createVoiceClient(GEMINI, () => {}, transport);
    client.connect();
    client.sendAudio("PCM");
    expect(sockets[0].sent).toHaveLength(0);

    sockets[0].handlers.onMessage(JSON.stringify({ setupComplete: {} }));
    client.sendAudio("PCM");
    client.sendText("hi");
    client.sendContext("ctx");
    client.sendToolResponse("c1", "next_task", { ok: true });

    expect(sockets[0].sent).toEqual([
      { realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: "PCM" } } },
      { clientContent: { turns: [{ role: "user", parts: [{ text: "hi" }] }], turnComplete: true } },
      { clientContent: { turns: [{ role: "user", parts: [{ text: "ctx" }] }], turnComplete: false } },
      { toolResponse: { functionResponses: [{ id: "c1", name: "next_task", response: { ok: true } }] } },
    ]);
  });

  it("classifies a quota close as fatal", () => {
    const { transport, sockets } = fakeTransport();
    const events: VoiceEvent[] = [];
    createVoiceClient(GEMINI, (e) => events.push(e), transport).connect();
    sockets[0].handlers.onClose({ code: 1011, reason: "Quota exceeded", wasClean: false });
    expect(events[0]).toMatchObject({ type: "closed", code: 1011, fatal: true });
  });

  it("disconnect closes the socket", () => {
    const { transport, sockets } = fakeTransport();
    const client = createVoiceClient(GEMINI, () => {}, transport);
    client.connect();
    client.disconnect();
    expect(sockets[0].closed).toBe(true);
  });
});

describe("XaiVoiceClient", () => {
  const okFetch = (): typeof fetch =>
    vi.fn(async () => new Response(JSON.stringify({ value: "eph-token" }), { status: 200 })) as unknown as typeof fetch;

  it("mints an ephemeral token through the transport fetch and opens with it as subprotocol", async () => {
    const fetchSpy = okFetch();
    const { transport, sockets } = fakeTransport(fetchSpy);
    const events: VoiceEvent[] = [];
    const client = createVoiceClient(XAI, (e) => events.push(e), transport);
    client.connect();
    await vi.waitFor(() => expect(sockets).toHaveLength(1));

    const [url, init] = (fetchSpy as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.x.ai/v1/realtime/client_secrets");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer xai-secret");
    expect(sockets[0].url).toBe("wss://api.x.ai/v1/realtime?model=gemini-live-x");
    expect(sockets[0].protocols).toEqual(["xai-client-secret.eph-token"]);
    // The vault key never rides on the socket.
    expect(sockets[0].url).not.toContain("xai-secret");

    sockets[0].handlers.onMessage(JSON.stringify({ type: "session.created" }));
    expect(sockets[0].sent[0]).toMatchObject({ type: "session.update" });
    sockets[0].handlers.onMessage(JSON.stringify({ type: "session.updated" }));
    sockets[0].handlers.onMessage(JSON.stringify({ type: "response.output_audio.delta", delta: "AAA=" }));
    sockets[0].handlers.onMessage(JSON.stringify({ type: "input_audio_buffer.speech_started" }));
    sockets[0].handlers.onMessage(JSON.stringify({ type: "response.done" }));
    expect(events).toEqual([
      { type: "setupComplete" },
      { type: "audio", data: "AAA=" },
      { type: "interrupted" },
      { type: "turnComplete" },
    ]);
  });

  it("reports an auth mint failure as a fatal close without opening a socket", async () => {
    const fetchSpy = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    const { transport, sockets } = fakeTransport(fetchSpy as unknown as typeof fetch);
    const events: VoiceEvent[] = [];
    createVoiceClient(XAI, (e) => events.push(e), transport).connect();
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({ type: "closed", fatal: true, reason: "ephemeral_token_auth" });
    expect(sockets).toHaveLength(0);
  });
});

describe("createWebSocketFactory", () => {
  class FakeWs implements WebSocketLike {
    static last: FakeWs | null = null;
    readyState = 0;
    binaryType = "blob";
    onopen: ((event: unknown) => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    onclose: ((event: { code: number; reason: string; wasClean?: boolean }) => void) | null = null;
    sent: string[] = [];
    constructor(
      readonly url: string,
      readonly protocols?: string[],
    ) {
      FakeWs.last = this;
    }
    send(data: string): void {
      this.sent.push(data);
    }
    close(): void {
      this.readyState = 3;
    }
  }

  it("asks for arraybuffer frames and decodes them (and strings) in order", async () => {
    const messages: string[] = [];
    const factory = createWebSocketFactory(FakeWs);
    const sock = factory("wss://x", ["p"], {
      onOpen: () => {},
      onMessage: (t) => messages.push(t),
      onError: () => {},
      onClose: () => {},
    });
    const ws = FakeWs.last!;
    expect(ws.binaryType).toBe("arraybuffer");
    expect(ws.protocols).toEqual(["p"]);

    ws.onmessage?.({ data: new TextEncoder().encode('{"a":"ü"}').buffer });
    ws.onmessage?.({ data: "plain" });
    // A Blob-like frame decodes asynchronously; later frames queue behind it.
    ws.onmessage?.({ data: { text: async () => "blob" } });
    ws.onmessage?.({ data: "after" });
    await vi.waitFor(() => expect(messages).toHaveLength(4));
    expect(messages).toEqual(['{"a":"ü"}', "plain", "blob", "after"]);

    expect(sock.isOpen()).toBe(false);
    ws.readyState = 1;
    expect(sock.isOpen()).toBe(true);
    sock.send("x");
    expect(ws.sent).toEqual(["x"]);
  });
});
