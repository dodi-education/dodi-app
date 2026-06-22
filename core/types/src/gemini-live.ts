/**
 * Shared tool-declaration shape for the Gemini Live API.
 *
 * Lives in @dodi/types so prompt/context builders (which assemble tool lists)
 * don't have to depend on the browser-only Gemini Live WebSocket client.
 */

export interface GeminiLiveToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
