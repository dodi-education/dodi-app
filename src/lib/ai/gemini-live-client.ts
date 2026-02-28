/**
 * WebSocket client for Gemini Live API (BidiGenerateContent).
 * Manages the connection lifecycle, setup handshake, and bidirectional audio streaming.
 */

export interface GeminiLiveConfig {
  apiKey: string;
  model: string;
  voiceName: string;
  systemInstruction: string;
}

export type GeminiLiveEvent =
  | { type: "setupComplete" }
  | { type: "audio"; data: string } // base64 PCM
  | { type: "text"; text: string }
  | { type: "interrupted" }
  | { type: "turnComplete" }
  | { type: "error"; error: string }
  | { type: "closed" };

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
      this.onEvent({ type: "error", error: "WebSocket connection error" });
    };

    this.ws.onclose = (event: CloseEvent) => {
      if (event.code !== 1000) {
        // Abnormal close — include details
        this.onEvent({
          type: "error",
          error: `WebSocket closed: ${event.code}${event.reason ? ` — ${event.reason}` : ""}`,
        });
      }
      this.onEvent({ type: "closed" });
    };
  }

  private sendSetup(): void {
    const setupMessage = {
      setup: {
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
      },
    };

    this.ws?.send(JSON.stringify(setupMessage));
  }

  private handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw);

      // Setup complete response
      if (msg.setupComplete !== undefined) {
        this.setupComplete = true;
        this.onEvent({ type: "setupComplete" });
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
          }
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
   */
  sendGreeting(): void {
    if (!this.setupComplete || !this.ws) return;

    const msg = {
      clientContent: {
        turns: [
          {
            role: "user",
            parts: [{ text: "Greet me!" }],
          },
        ],
        turnComplete: true,
      },
    };

    this.ws.send(JSON.stringify(msg));
  }

  /**
   * Send audio data from the microphone as realtime input.
   */
  sendAudio(base64Pcm: string): void {
    if (!this.setupComplete || !this.ws) return;

    const msg = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: "audio/pcm;rate=16000",
            data: base64Pcm,
          },
        ],
      },
    };

    this.ws.send(JSON.stringify(msg));
  }

  /**
   * Send a text message as client content.
   */
  sendText(text: string): void {
    if (!this.setupComplete || !this.ws) return;

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

    this.ws.send(JSON.stringify(msg));
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setupComplete = false;
  }
}
