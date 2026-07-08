/**
 * xAI Grok Voice Agent client. Speaks xAI's realtime WebSocket protocol
 * (OpenAI-Realtime-compatible) and adapts it to the provider-neutral
 * {@link VoiceClient} contract so the session store drives it exactly like the
 * Gemini Live client.
 *
 * Provider-blindness: browsers can't set WebSocket auth headers, so we mint a
 * short-lived ephemeral token directly from the browser using the vault key
 * (POST /v1/realtime/client_secrets) and open the socket with it as a subprotocol.
 * The vault key never leaves the device and our server never sees it.
 *
 * Audio matches the app pipeline: PCM16 in at 16 kHz (recorder), out at 24 kHz
 * (streamer).
 */

import type {
  VoiceClient,
  VoiceClientConfig,
  VoiceEvent,
  VoiceGreetingMode,
} from "./voice-client";
import { classifyClose, greetingText } from "./voice-client";

const XAI_BASE_URL = "https://api.x.ai/v1";
const XAI_REALTIME_WS = "wss://api.x.ai/v1/realtime";
const EPHEMERAL_TOKEN_TTL_SECONDS = 300;
// Playback-speed multiplier for Grok's spoken output (xAI range ~0.7–1.5, default
// 1.0). 1.1 reads as a touch more energetic without hurting intelligibility.
const XAI_VOICE_SPEED = 1.1;

export class XaiVoiceClient implements VoiceClient {
  private ws: WebSocket | null = null;
  private config: VoiceClientConfig;
  private onEvent: (event: VoiceEvent) => void;
  private setupComplete = false;

  constructor(config: VoiceClientConfig, onEvent: (event: VoiceEvent) => void) {
    this.config = config;
    this.onEvent = onEvent;
  }

  connect(): void {
    void this.#open();
  }

  private async mintEphemeralToken(): Promise<string> {
    const res = await fetch(`${XAI_BASE_URL}/realtime/client_secrets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        expires_after: { seconds: EPHEMERAL_TOKEN_TTL_SECONDS },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `xAI ephemeral token request failed (${res.status})${detail ? `: ${detail}` : ""}`,
      );
    }

    const data = (await res.json()) as {
      value?: string;
      secret?: string;
      token?: string;
      client_secret?: { value?: string };
    };
    const token =
      data.value ?? data.client_secret?.value ?? data.secret ?? data.token;
    if (typeof token !== "string" || !token) {
      throw new Error("xAI ephemeral token response contained no token");
    }
    return token;
  }

  async #open(): Promise<void> {
    let token: string;
    try {
      token = await this.mintEphemeralToken();
    } catch (err) {
      // No socket ever opened; surface a terminal (fatal) close so the session
      // store stops the reconnect hot-loop and shows a helpful message.
      this.onEvent({
        type: "closed",
        code: 0,
        reason: "ephemeral_token",
        fatal: true,
        message:
          err instanceof Error && /40[13]|unauthor|api.?key/i.test(err.message)
            ? "dodi couldn't authenticate with xAI. Please check the API key in parent settings, then reconnect."
            : "dodi couldn't start the xAI voice session. Please try again in a moment.",
      });
      return;
    }

    const subprotocol = token.startsWith("xai-client-secret.")
      ? token
      : `xai-client-secret.${token}`;
    const url = `${XAI_REALTIME_WS}?model=${encodeURIComponent(this.config.model)}`;
    this.ws = new WebSocket(url, [subprotocol]);

    this.ws.onmessage = async (event: MessageEvent) => {
      const raw =
        event.data instanceof Blob
          ? await event.data.text()
          : (event.data as string);
      this.handleMessage(raw);
    };

    this.ws.onerror = () => {
      console.error("[XaiVoice] WebSocket error", {
        model: this.config.model,
        setupComplete: this.setupComplete,
      });
      this.onEvent({ type: "error", error: "WebSocket connection error" });
    };

    this.ws.onclose = (event: CloseEvent) => {
      console.warn("[XaiVoice] WebSocket closed", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        model: this.config.model,
        setupComplete: this.setupComplete,
      });
      this.setupComplete = false;
      const { fatal, message } = classifyClose(event.code, event.reason || "");
      this.onEvent({
        type: "closed",
        code: event.code,
        reason: event.reason || "",
        fatal,
        message,
      });
    };
  }

  private isOpen(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private send(msg: Record<string, unknown>): void {
    if (!this.isOpen()) return;
    this.ws!.send(JSON.stringify(msg));
  }

  /** Push our persona/voice/tool config once the server opens the session. */
  private sendSessionUpdate(): void {
    const session: Record<string, unknown> = {
      instructions: this.config.systemInstruction,
      voice: this.config.voiceName,
      turn_detection: { type: "server_vad" },
      audio: {
        input: {
          format: { type: "audio/pcm", rate: 16000 },
          // Enable input transcription so we get the kid's speech as text.
          transcription: {},
        },
        output: {
          format: { type: "audio/pcm", rate: 24000 },
          speed: XAI_VOICE_SPEED,
        },
      },
    };

    if (this.config.tools && this.config.tools.length > 0) {
      session.tools = this.config.tools.map((t) => ({
        type: "function",
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));
    }

    this.send({ type: "session.update", session });
  }

  private handleMessage(raw: string): void {
    let msg: {
      type?: string;
      delta?: unknown;
      transcript?: unknown;
      name?: string;
      call_id?: string;
      arguments?: unknown;
      error?: { message?: string };
    };
    try {
      msg = JSON.parse(raw);
    } catch {
      this.onEvent({ type: "error", error: "Failed to parse server message" });
      return;
    }

    switch (msg.type) {
      // The server opens the session first; reply with our config, then treat
      // the acknowledgement as "ready" (persona/voice/tools are now applied).
      case "session.created":
        this.sendSessionUpdate();
        return;

      case "session.updated":
        if (!this.setupComplete) {
          this.setupComplete = true;
          this.onEvent({ type: "setupComplete" });
        }
        return;

      // Dodi's spoken audio (base64 PCM16 @ 24 kHz).
      case "response.output_audio.delta":
      case "response.audio.delta":
        if (typeof msg.delta === "string") {
          this.onEvent({ type: "audio", data: msg.delta });
        }
        return;

      // Dodi's words as text (for the transcript / memory pipeline).
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta":
        if (typeof msg.delta === "string") {
          this.onEvent({ type: "outputTranscription", text: msg.delta });
        }
        return;

      // The kid's speech transcribed (xAI renames OpenAI's `.delta` → `.updated`).
      case "conversation.item.input_audio_transcription.updated":
      case "conversation.item.input_audio_transcription.delta":
      case "conversation.item.input_audio_transcription.completed": {
        const text = typeof msg.transcript === "string" ? msg.transcript : msg.delta;
        if (typeof text === "string" && text) {
          this.onEvent({ type: "inputTranscription", text });
        }
        return;
      }

      // A tool/function call with complete arguments.
      case "response.function_call_arguments.done": {
        let args: Record<string, unknown> = {};
        if (typeof msg.arguments === "string" && msg.arguments.trim()) {
          try {
            args = JSON.parse(msg.arguments) as Record<string, unknown>;
          } catch {
            args = {};
          }
        }
        this.onEvent({
          type: "toolCall",
          id: msg.call_id ?? msg.name ?? "",
          name: msg.name ?? "",
          args,
        });
        return;
      }

      // Barge-in: the kid started talking, so stop Dodi's current playback.
      case "input_audio_buffer.speech_started":
        this.onEvent({ type: "interrupted" });
        return;

      case "response.done":
        this.onEvent({ type: "turnComplete" });
        return;

      case "error":
        this.onEvent({
          type: "error",
          error: msg.error?.message ?? "xAI realtime error",
        });
        return;

      default:
        return;
    }
  }

  /** Stream microphone audio (base64 PCM16 @ 16 kHz) as realtime input. */
  sendAudio(base64Pcm: string): void {
    if (!this.setupComplete || !this.isOpen()) return;
    this.send({ type: "input_audio_buffer.append", audio: base64Pcm });
  }

  /** Inject a user turn and elicit a spoken response. */
  sendText(text: string): void {
    if (!this.setupComplete || !this.isOpen()) return;
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    });
    this.send({ type: "response.create" });
  }

  /** Background context the model reads but does not respond to (no new turn). */
  sendContext(text: string): void {
    if (!this.setupComplete || !this.isOpen()) return;
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    });
  }

  sendGreeting(mode: VoiceGreetingMode = "long"): void {
    this.sendText(greetingText(mode));
  }

  /** Return a tool result and let the model continue. `name` is unused (xAI keys
   * tool results by `call_id`); kept for the shared VoiceClient signature. */
  sendToolResponse(
    callId: string,
    _name: string,
    response: Record<string, unknown>,
  ): void {
    if (!this.setupComplete || !this.isOpen()) return;
    this.send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(response),
      },
    });
    this.send({ type: "response.create" });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setupComplete = false;
  }
}
