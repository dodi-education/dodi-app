import type { AIProviderId, AIProviderDefinition } from "@dodi/types/ai";

export const AI_PROVIDERS: AIProviderDefinition[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    supportsVoice: true,
    supportsLiveStreaming: true,
    supportsThinking: true,
    supportsImage: true,
    models: [
      {
        id: "gemini-3.1-flash-live-preview",
        name: "Gemini 3.1 Flash Live (Native Audio)",
        capabilities: ["voice", "text", "live"],
      },
      {
        id: "gemini-3.5-flash",
        name: "Gemini 3.5 Flash",
        capabilities: ["text", "thinking"],
      },
      {
        id: "gemini-3.1-flash-image",
        name: "Nano Banana 2 (Gemini 3.1 Flash Image)",
        capabilities: ["image"],
      },
      {
        id: "gemini-3-pro-image",
        name: "Nano Banana Pro (Gemini 3 Pro Image)",
        capabilities: ["image"],
      },
    ],
    voices: [
      { id: "Leda", name: "Leda" },
      { id: "Puck", name: "Puck" },
      { id: "Charon", name: "Charon" },
      { id: "Kore", name: "Kore" },
      { id: "Fenrir", name: "Fenrir" },
      { id: "Aoede", name: "Aoede" },
      { id: "Orus", name: "Orus" },
      { id: "Zephyr", name: "Zephyr" },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    supportsVoice: false,
    supportsLiveStreaming: false,
    supportsThinking: true,
    supportsImage: false,
    models: [
      {
        id: "claude-opus-4-8",
        name: "Claude Opus 4.8",
        capabilities: ["text", "thinking"],
      },
      {
        id: "claude-sonnet-4-6",
        name: "Claude Sonnet 4.6",
        capabilities: ["text", "thinking"],
      },
      {
        id: "claude-haiku-4-5-20251001",
        name: "Claude Haiku 4.5",
        capabilities: ["text", "thinking"],
      },
    ],
    voices: [],
  },
  // Future providers:
  // { id: "openai", name: "OpenAI", ... },
  // { id: "xai", name: "xAI Grok", ... },
];

export function getProviderDefinition(
  id: AIProviderId,
): AIProviderDefinition | undefined {
  return AI_PROVIDERS.find((p) => p.id === id);
}

export function getAvailableProviders(): AIProviderDefinition[] {
  return AI_PROVIDERS;
}
