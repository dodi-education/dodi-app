export type AIProviderId = "gemini" | "openai" | "anthropic" | "xai";

export interface AIProviderDefinition {
  id: AIProviderId;
  name: string;
  supportsVoice: boolean;
  supportsLiveStreaming: boolean;
  models: AIModel[];
  voices: AIVoice[];
}

export interface AIModel {
  id: string;
  name: string;
  capabilities: ("voice" | "text" | "live")[];
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
  gameProvider?: AIProviderId;
  gameModel?: string;
}

// What the GET /api/ai/providers endpoint returns (no actual keys)
export interface ConfiguredProvider {
  id: AIProviderId;
  name: string;
  addedAt: string;
  keyPreview: string;
}
