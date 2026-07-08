/**
 * WebSocket client for Gemini Live API (BidiGenerateContent).
 * Manages the connection lifecycle, setup handshake, and bidirectional audio streaming.
 * Supports function calling (tools) for structured game command execution.
 */

import type {
  VoiceClient,
  VoiceClientConfig,
  VoiceEvent,
  VoiceGreetingMode,
} from "./voice-client";
import { classifyClose, greetingText } from "./voice-client";

const GEMINI_WS_BASE =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

export class GeminiLiveClient implements VoiceClient {
  private ws: WebSocket | null = null;
  private config: VoiceClientConfig;
  private onEvent: (event: VoiceEvent) => void;
  private setupComplete = false;

  constructor(
    config: VoiceClientConfig,
    onEvent: (event: VoiceEvent) => void,
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
      // Enable sliding-window context compression so long sessions don't hit the
      // ~15-min audio session cap and get abruptly cut off mid-conversation.
      // No triggerTokens → Gemini uses the default near-ceiling trigger, so normal
      // chats keep full context and only marathon sessions ever evict stale turns.
      // The systemInstruction (persona/memory/child name) lives outside the sliding
      // window, so this never causes persona drift; the full transcript is still
      // captured client-side for the memory pipeline.
      contextWindowCompression: {
        slidingWindow: {},
      },
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
  sendGreeting(mode: VoiceGreetingMode = "long"): void {
    if (!this.setupComplete || !this.isOpen()) return;

    const text = greetingText(mode);

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
