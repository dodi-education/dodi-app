/**
 * Provider-neutral voice-client contract. dodi's realtime voice companion can be
 * driven by different providers (Gemini Live, xAI Grok Voice Agent, …); each one
 * speaks its own wire protocol but implements this common interface and emits the
 * same `VoiceEvent` union, so the session store consumes them interchangeably via
 * `createVoiceClient`.
 *
 * This module is a leaf (types + pure helpers, no client-class imports) so both
 * client implementations can import from it without a cycle.
 */

import type { AIProviderId } from "@dodi/types/ai";
import type { GeminiLiveToolDeclaration } from "@dodi/types/gemini-live";

/** Provider-neutral tool declaration (name/description/JSON-schema params). */
export type VoiceToolDeclaration = GeminiLiveToolDeclaration;

export interface VoiceClientConfig {
  provider: AIProviderId;
  apiKey: string;
  model: string;
  voiceName: string;
  systemInstruction: string;
  tools?: VoiceToolDeclaration[];
}

export type VoiceEvent =
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

export type VoiceGreetingMode = "long" | "short" | "birthday";

export interface VoiceClient {
  connect(): void;
  sendAudio(base64Pcm: string): void;
  sendText(text: string): void;
  /** Background context the model reads but does not respond to (no new turn). */
  sendContext(text: string): void;
  sendGreeting(mode?: VoiceGreetingMode): void;
  sendToolResponse(
    callId: string,
    name: string,
    response: Record<string, unknown>,
  ): void;
  disconnect(): void;
}

/** The greeting-trigger prompt sent as a user turn to open a session. */
export function greetingText(mode: VoiceGreetingMode = "long"): string {
  if (mode === "birthday") {
    return "It's my birthday today! Wish me a big happy birthday, say my name, and offer to sing me the Happy Birthday song!";
  }
  if (mode === "long") {
    return "Greet me! Say hello to me by name and suggest what we could do together today.";
  }
  return "Give me just a single quick, creative, funny greeting word — no name, no suggestions, just one fun word like 'Yooo!' or 'Hola!' or something playful!";
}

/**
 * Classify a WebSocket close. `fatal` means reconnecting will not help — the
 * caller should stop retrying and surface `message` to the user. Provider-neutral
 * (matches on quota/auth signals present across providers' close reasons).
 */
export function classifyClose(
  code: number,
  reason: string,
): { fatal: boolean; message: string } {
  const r = reason.toLowerCase();

  if (r.includes("quota") || r.includes("exceeded") || r.includes("resource_exhausted")) {
    return {
      fatal: true,
      message:
        "dodi has used up the AI provider's quota for now. Please check your plan and billing details for the configured API key, then reconnect.",
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
        "dodi couldn't authenticate with the AI provider. Please check the API key in parent settings, then reconnect.",
    };
  }

  return {
    fatal: false,
    message: `Connection closed unexpectedly${code ? ` (code ${code})` : ""}.`,
  };
}
