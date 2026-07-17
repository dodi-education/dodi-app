export type AIProviderId = "gemini" | "openai" | "anthropic" | "xai";

export interface AIProviderDefinition {
  id: AIProviderId;
  name: string;
  supportsVoice: boolean;
  supportsLiveStreaming: boolean;
  supportsThinking: boolean;
  supportsImage: boolean;
  // Can drive the game-coding agent's tool-use loop (runGameAgent). Today only
  // Anthropic; the Game generation picker filters providers on this flag.
  supportsAgentic: boolean;
  models: AIModel[];
  voices: AIVoice[];
}

export interface AIModel {
  id: string;
  name: string;
  capabilities: ("voice" | "text" | "live" | "thinking" | "image" | "agentic")[];
  /** Hard output-token cap the provider enforces for this model. Used to clamp
   *  agent `max_tokens` (asking above the cap is a 400 on Anthropic). Unset ⇒
   *  callers apply a conservative fallback (see `getModelOutputCap`). */
  maxOutputTokens?: number;
}

export interface AIVoice {
  id: string;
  name: string;
}

// Shape stored in accounts.encrypted_api_keys (JSONB)
// Each provider's key is individually encrypted
export interface StoredAPIKeys {
  [providerId: string]: {
    iv: string;
    ciphertext: string;
    tag: string;
    keyPreview: string;
    addedAt: string;
  };
}

// Shape stored in accounts.model_config (JSONB)
export interface AccountModelConfig {
  voiceProvider: AIProviderId;
  voiceModel: string;
  voiceName: string;
  thinkingProvider?: AIProviderId;
  thinkingModel?: string;
  // Game generation (creation/editing, success-definition mapping). Runs the
  // Anthropic tool-use agent, so this must be an agentic (tool-use) provider.
  gameProvider?: AIProviderId;
  gameModel?: string;
  imageProvider?: AIProviderId;
  imageModel?: string;
}

// What the GET /api/ai/providers endpoint returns (no actual keys)
export interface ConfiguredProvider {
  id: AIProviderId;
  name: string;
  addedAt: string;
  keyPreview: string;
}
