/**
 * WebSocket client for Gemini Live API (BidiGenerateContent).
 * Manages the connection lifecycle, setup handshake, and bidirectional audio streaming.
 * Supports function calling (tools) for structured game command execution.
 */

import type { GeminiLiveToolDeclaration } from "@dodi/types/gemini-live";

export type { GeminiLiveToolDeclaration } from "@dodi/types/gemini-live";

export interface GeminiLiveConfig {
  apiKey: string;
  model: string;
  voiceName: string;
  systemInstruction: string;
  tools?: GeminiLiveToolDeclaration[];
}

export type GeminiLiveEvent =
  | { type: "setupComplete" }
  | { type: "audio"; data: string } // base64 PCM
  | { type: "text"; text: string }
  | { type: "inputTranscription"; text: string } // kid's speech
  | { type: "outputTranscription"; text: string } // Dodi's spoken words
  | { type: "toolCall"; id: string; name: string; args: Record<string, unknown> }
  | { type: "interrupted" }
  | { type: "turnComplete" }
  | { type: "error"; error: string }
  | { type: "closed"; code: number; reason: string; fatal: boolean; message: string };

/**
 * Classify a WebSocket close. `fatal` means reconnecting will not help — the
 * caller should stop retrying and surface `message` to the user.
 */
function classifyClose(
  code: number,
  reason: string,
): { fatal: boolean; message: string } {
  const r = reason.toLowerCase();

  if (r.includes("quota") || r.includes("exceeded") || r.includes("resource_exhausted")) {
    return {
      fatal: true,
      message:
        "Dodi has used up the AI provider's quota for now. Please check your plan and billing details for the configured API key, then reconnect.",
    };
  }

  if (
    code === 1008 ||
    r.includes("api key") ||
    r.includes("api_key") ||
    r.includes("permission") ||
    r.includes("unauthenticated") ||
    r.includes("unauthorized")
  ) {
    return {
      fatal: true,
      message:
        "Dodi couldn't authenticate with the AI provider. Please check the API key in parent settings, then reconnect.",
    };
  }

  return {
    fatal: false,
    message: `Connection closed unexpectedly${code ? ` (code ${code})` : ""}.`,
  };
}

const GEMINI_WS_BASE =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

export class GeminiLiveClient {
  private ws: WebSocket | null = null;
  private config: GeminiLiveConfig;
  private onEvent: (event: GeminiLiveEvent) => void;
  private setupComplete = false;

  constructor(
    config: GeminiLiveConfig,
    onEvent: (event: GeminiLiveEvent) => void,
  ) {
    this.config = config;
    this.onEvent = onEvent;
  }

  connect(): void {
    const url = `${GEMINI_WS_BASE}?key=${this.config.apiKey}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.sendSetup();
    };

    this.ws.onmessage = async (event: MessageEvent) => {
      // Gemini Live API sends binary (Blob) frames, not text
      let raw: string;
      if (event.data instanceof Blob) {
        raw = await event.data.text();
      } else {
        raw = event.data as string;
      }
      this.handleMessage(raw);
    };

    this.ws.onerror = () => {
      console.error("[GeminiLive] WebSocket error", {
        model: this.config.model,
        setupComplete: this.setupComplete,
      });
      this.onEvent({ type: "error", error: "WebSocket connection error" });
    };

    this.ws.onclose = (event: CloseEvent) => {
      console.warn("[GeminiLive] WebSocket closed", {
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

  private sendSetup(): void {
    const setup: Record<string, unknown> = {
      model: `models/${this.config.model}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: this.config.voiceName,
            },
          },
        },
      },
      systemInstruction: {
        parts: [{ text: this.config.systemInstruction }],
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    };

    if (this.config.tools && this.config.tools.length > 0) {
      setup.tools = [
        {
          functionDeclarations: this.config.tools,
        },
      ];
    }

    if (!this.isOpen()) return;
    this.ws!.send(JSON.stringify({ setup }));
  }

  private handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw);

      // Server-side error or session-ending signals (otherwise silently dropped)
      if (msg.goAway) {
        console.warn("[GeminiLive] goAway received", msg.goAway);
      }
      if (msg.error) {
        console.warn("[GeminiLive] server error message", raw.slice(0, 500));
      }

      // Setup complete response
      if (msg.setupComplete !== undefined) {
        this.setupComplete = true;
        this.onEvent({ type: "setupComplete" });
        return;
      }

      // Tool call message
      if (msg.toolCall) {
        const functionCalls = msg.toolCall.functionCalls;
        if (Array.isArray(functionCalls)) {
          for (const fc of functionCalls) {
            this.onEvent({
              type: "toolCall",
              id: fc.id ?? fc.name ?? "",
              name: fc.name,
              args: fc.args ?? {},
            });
          }
        }
        return;
      }

      // Server content (audio or text)
      if (msg.serverContent) {
        const content = msg.serverContent;

        // Check for interruption
        if (content.interrupted) {
          this.onEvent({ type: "interrupted" });
          return;
        }

        // Process model turn parts
        if (content.modelTurn?.parts) {
          for (const part of content.modelTurn.parts) {
            if (part.inlineData?.data) {
              this.onEvent({ type: "audio", data: part.inlineData.data });
            }
            if (part.text) {
              this.onEvent({ type: "text", text: part.text });
            }
            // Function calls can also appear inside modelTurn parts
            if (part.functionCall) {
              this.onEvent({
                type: "toolCall",
                id: part.functionCall.id ?? part.functionCall.name ?? "",
                name: part.functionCall.name,
                args: part.functionCall.args ?? {},
              });
            }
          }
        }

        // Input transcription (kid's speech transcribed by Gemini)
        if (content.inputTranscription?.text) {
          this.onEvent({
            type: "inputTranscription",
            text: content.inputTranscription.text,
          });
        }

        // Output transcription (Dodi's spoken words transcribed by Gemini)
        if (content.outputTranscription?.text) {
          this.onEvent({
            type: "outputTranscription",
            text: content.outputTranscription.text,
          });
        }

        // Turn complete
        if (content.turnComplete) {
          this.onEvent({ type: "turnComplete" });
        }
      }
    } catch {
      this.onEvent({ type: "error", error: "Failed to parse server message" });
    }
  }

  /**
   * Send a greeting trigger after setup is complete.
   * "long" = name + suggestions; "short" = single creative word.
   */
  sendGreeting(mode: "long" | "short" | "birthday" = "long"): void {
    if (!this.setupComplete || !this.isOpen()) return;

    let text: string;
    if (mode === "birthday") {
      text = "It's my birthday today! Wish me a big happy birthday, say my name, and offer to sing me the Happy Birthday song!";
    } else if (mode === "long") {
      text = "Greet me! Say hello to me by name and suggest what we could do together today.";
    } else {
      text = "Give me just a single quick, creative, funny greeting word — no name, no suggestions, just one fun word like 'Yooo!' or 'Hola!' or something playful!";
    }

    const msg = {
      clientContent: {
        turns: [
          {
            role: "user",
            parts: [{ text }],
          },
        ],
        turnComplete: true,
      },
    };

    this.ws!.send(JSON.stringify(msg));
  }

  /**
   * Send audio data from the microphone as realtime input.
   */
  sendAudio(base64Pcm: string): void {
    if (!this.setupComplete || !this.isOpen()) return;

    // Newer Live models require the singular `audio` Blob field;
    // `realtimeInput.mediaChunks` is deprecated and rejected (close 1007).
    const msg = {
      realtimeInput: {
        audio: {
          mimeType: "audio/pcm;rate=16000",
          data: base64Pcm,
        },
      },
    };

    this.ws!.send(JSON.stringify(msg));
  }

  /**
   * Send a text message as client content.
   */
  sendText(text: string): void {
    if (!this.setupComplete || !this.isOpen()) return;

    const msg = {
      clientContent: {
        turns: [
          {
            role: "user",
            parts: [{ text }],
          },
        ],
        turnComplete: true,
      },
    };

    this.ws!.send(JSON.stringify(msg));
  }

  /**
   * Send context without completing the turn.
   * The AI sees this text as background context but does not treat it as a conversation message.
   */
  sendContext(text: string): void {
    if (!this.setupComplete || !this.isOpen()) return;

    const msg = {
      clientContent: {
        turns: [
          {
            role: "user",
            parts: [{ text }],
          },
        ],
        turnComplete: false,
      },
    };

    this.ws!.send(JSON.stringify(msg));
  }

  /**
   * Send a tool/function call response back to the model.
   */
  sendToolResponse(callId: string, name: string, response: Record<string, unknown>): void {
    if (!this.setupComplete || !this.isOpen()) return;

    const msg = {
      toolResponse: {
        functionResponses: [
          {
            id: callId,
            name,
            response,
          },
        ],
      },
    };

    this.ws!.send(JSON.stringify(msg));
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setupComplete = false;
  }
}
