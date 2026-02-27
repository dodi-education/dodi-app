import type { AIProviderId, AIProviderDefinition } from "@/types/ai";

export const AI_PROVIDERS: AIProviderDefinition[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    supportsVoice: true,
    supportsLiveStreaming: true,
    models: [
      {
        id: "gemini-2.5-flash-native-audio-preview-12-2025",
        name: "Gemini 2.5 Flash (Native Audio)",
        capabilities: ["voice", "text", "live"],
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
  // Future providers will be added here:
  // { id: "openai", name: "OpenAI", ... },
  // { id: "anthropic", name: "Anthropic Claude", ... },
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
