import type { AIProviderId, AIProviderDefinition } from "@dodi/types/ai";

export const AI_PROVIDERS: AIProviderDefinition[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    supportsVoice: true,
    supportsLiveStreaming: true,
    supportsThinking: true,
    supportsImage: true,
    supportsAgentic: false,
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
    supportsAgentic: true,
    models: [
      {
        id: "claude-opus-4-8",
        name: "Claude Opus 4.8",
        capabilities: ["text", "thinking", "agentic"],
        maxOutputTokens: 128_000,
      },
      {
        id: "claude-sonnet-4-6",
        name: "Claude Sonnet 4.6",
        capabilities: ["text", "thinking", "agentic"],
        maxOutputTokens: 64_000,
      },
      {
        id: "claude-haiku-4-5-20251001",
        name: "Claude Haiku 4.5",
        capabilities: ["text", "thinking", "agentic"],
        maxOutputTokens: 64_000,
      },
    ],
    voices: [],
  },
  {
    id: "xai",
    name: "xAI Grok",
    supportsVoice: true,
    supportsLiveStreaming: true,
    supportsThinking: true,
    supportsImage: true,
    supportsAgentic: true,
    models: [
      // Voice Agent API (OpenAI-Realtime-compatible). `grok-voice-latest` is the
      // stable alias that always points at the newest voice model.
      {
        id: "grok-voice-latest",
        name: "Grok Voice",
        capabilities: ["voice", "live"],
      },
      // Text/reasoning models drive thinking + the game-coding agent (Grok
      // supports OpenAI-style tool calling), listed newest first: the config UI
      // seeds models[0] for a capability, so `grok-4.6` (xAI's current flagship)
      // is what a fresh BYOK selection picks. The fast variant trades some
      // quality for latency/cost.
      {
        id: "grok-4.6",
        name: "Grok 4.6",
        capabilities: ["text", "thinking", "agentic"],
      },
      {
        id: "grok-4.5",
        name: "Grok 4.5",
        capabilities: ["text", "thinking", "agentic"],
      },
      {
        id: "grok-4.3",
        name: "Grok 4.3",
        capabilities: ["text", "thinking", "agentic"],
      },
      {
        id: "grok-4-fast-reasoning",
        name: "Grok 4 Fast (Reasoning)",
        capabilities: ["text", "thinking", "agentic"],
      },
      // Image generation (Grok Imagine, OpenAI images-API-compatible).
      {
        id: "grok-imagine-image",
        name: "Grok Imagine",
        capabilities: ["image"],
      },
      {
        id: "grok-imagine-image-pro",
        name: "Grok Imagine Pro",
        capabilities: ["image"],
      },
    ],
    voices: [
      // Ara is the default (first entry) — the config UI seeds voices[0].
      { id: "ara", name: "Ara" },
      { id: "eve", name: "Eve" },
      { id: "rex", name: "Rex" },
      { id: "sal", name: "Sal" },
      { id: "leo", name: "Leo" },
    ],
  },
  {
    // Venice — OpenAI-compatible gateway (privacy-first, no prompt retention)
    // for many upstream text and image models; no realtime voice. Curated
    // list: tool-calling text models that can drive the game agent, newest
    // and strongest first (the config UI seeds models[0] for a capability).
    // Ids are Venice's own (hyphenated, e.g. `grok-4-3`, not xAI's `grok-4.3`).
    // Output caps are Venice's `maxCompletionTokens`: several sit below the
    // 64k fallback, and requesting more is a 400.
    id: "venice",
    name: "Venice",
    supportsVoice: false,
    supportsLiveStreaming: false,
    supportsThinking: true,
    supportsImage: true,
    supportsAgentic: true,
    models: [
      {
        id: "claude-opus-5-5",
        name: "Claude Opus 5.5",
        capabilities: ["text", "thinking", "agentic"],
        maxOutputTokens: 128_000,
      },
      {
        id: "claude-sonnet-5-5",
        name: "Claude Sonnet 5.5",
        capabilities: ["text", "thinking", "agentic"],
        maxOutputTokens: 128_000,
      },
      {
        id: "grok-4-7",
        name: "Grok 4.7",
        capabilities: ["text", "thinking", "agentic"],
        maxOutputTokens: 128_000,
      },
      {
        id: "grok-4-5",
        name: "Grok 4.5",
        capabilities: ["text", "thinking", "agentic"],
        maxOutputTokens: 32_000,
      },
      {
        id: "grok-4-3",
        name: "Grok 4.3",
        capabilities: ["text", "thinking", "agentic"],
        maxOutputTokens: 32_000,
      },
      {
        id: "kimi-k2-6",
        name: "Kimi K2.6",
        capabilities: ["text", "thinking", "agentic"],
        maxOutputTokens: 65_536,
      },
      {
        id: "zai-org-glm-5-2",
        name: "GLM 5.2",
        capabilities: ["text", "thinking", "agentic"],
        maxOutputTokens: 128_000,
      },
      {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        capabilities: ["text", "thinking", "agentic"],
        maxOutputTokens: 32_768,
      },
      {
        id: "grok-imagine-image",
        name: "Grok Imagine",
        capabilities: ["image"],
      },
      {
        id: "grok-imagine-image-2-0",
        name: "Grok Imagine 2.0",
        capabilities: ["image"],
      },
      {
        id: "z-image-turbo",
        name: "Z-Image Turbo",
        capabilities: ["image"],
      },
    ],
    voices: [],
  },
  {
    // dodi AI — the managed meta-provider. Selectable per category like any
    // BYOK provider, but there is no vault key: resolvers map "dodi" to a real
    // provider + a dodi-minted inference key before any adapter runs, so it
    // must never reach the factories/switches. The model list is the curated,
    // billed catalog (real upstream ids — usage reporting stays untouched);
    // "default" is a sentinel resolved against platform_config at call time.
    id: "dodi",
    name: "dodi AI",
    isManaged: true,
    supportsVoice: true,
    supportsLiveStreaming: true,
    supportsThinking: true,
    supportsImage: true,
    supportsAgentic: true,
    models: [
      {
        id: "default",
        name: "dodi default",
        capabilities: ["voice", "text", "live", "thinking", "image", "agentic"],
      },
      {
        id: "grok-voice-latest",
        name: "Grok Voice",
        capabilities: ["voice", "live"],
      },
      // Text and image run on Venice (its model ids); voice stays on xAI.
      {
        id: "claude-opus-5-5",
        name: "Claude Opus 5.5",
        capabilities: ["text", "thinking", "agentic"],
        maxOutputTokens: 128_000,
      },
      {
        id: "grok-4-3",
        name: "Grok 4.3",
        capabilities: ["text", "thinking", "agentic"],
        maxOutputTokens: 32_000,
      },
      {
        id: "grok-imagine-image",
        name: "Grok Imagine",
        capabilities: ["image"],
      },
    ],
    voices: [
      { id: "ara", name: "Ara" },
      { id: "eve", name: "Eve" },
      { id: "rex", name: "Rex" },
      { id: "sal", name: "Sal" },
      { id: "leo", name: "Leo" },
    ],
  },
];

export function getProviderDefinition(
  id: AIProviderId,
): AIProviderDefinition | undefined {
  return AI_PROVIDERS.find((p) => p.id === id);
}

/** Output cap applied to models without a registered `maxOutputTokens` (e.g.
 *  the Grok models, whose live limits are unverified). Conservative on purpose:
 *  requesting more than a model's true maximum is a 400 on Anthropic-style
 *  APIs, while 64k is comfortably above any real game bundle. */
export const FALLBACK_MODEL_OUTPUT_CAP = 64_000;

/** Hard output-token cap for a model, for clamping agent `max_tokens`. */
export function getModelOutputCap(provider: AIProviderId, modelId: string): number {
  const model = getProviderDefinition(provider)?.models.find((m) => m.id === modelId);
  return model?.maxOutputTokens ?? FALLBACK_MODEL_OUTPUT_CAP;
}

export function getAvailableProviders(): AIProviderDefinition[] {
  return AI_PROVIDERS;
}
