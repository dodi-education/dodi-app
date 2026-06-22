import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@dodi/types/database";
import type {
  AIProviderId,
  AccountModelConfig,
  ConfiguredProvider,
  StoredAPIKeys,
} from "@dodi/types/ai";
import { encrypt, decrypt } from "@/lib/encryption";
import { getProviderDefinition } from "@dodi/ai/providers";

type Client = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// E2EE provider keys: `accounts.encrypted_api_keys` now holds a single opaque
// blob the CLIENT sealed under the account VMK. The server stores/returns it
// verbatim and can never read a key. (Replaces the server-side ENCRYPTION_SECRET
// path; see src/lib/vault/api-keys-crypto.ts.)
// ---------------------------------------------------------------------------

export async function getEncryptedProviders(
  supabase: Client,
  accountId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("accounts")
    .select("encrypted_api_keys")
    .eq("id", accountId)
    .single();
  if (error) throw error;
  return (data.encrypted_api_keys as unknown as string | null) ?? null;
}

export async function setEncryptedProviders(
  supabase: Client,
  accountId: string,
  blob: string,
): Promise<void> {
  const { error } = await supabase
    .from("accounts")
    .update({
      encrypted_api_keys:
        blob as unknown as Database["public"]["Tables"]["accounts"]["Update"]["encrypted_api_keys"],
    })
    .eq("id", accountId);
  if (error) throw error;
}

export async function getConfiguredProviders(
  supabase: Client,
  accountId: string,
): Promise<ConfiguredProvider[]> {
  const { data, error } = await supabase
    .from("accounts")
    .select("encrypted_api_keys")
    .eq("id", accountId)
    .single();

  if (error) throw error;

  const keys = data.encrypted_api_keys as unknown as StoredAPIKeys | null;
  if (!keys) return [];

  const providers: ConfiguredProvider[] = [];
  for (const [providerId, entry] of Object.entries(keys)) {
    const definition = getProviderDefinition(providerId as AIProviderId);
    if (!definition) continue;

    providers.push({
      id: providerId as AIProviderId,
      name: definition.name,
      addedAt: entry.addedAt,
      keyPreview: entry.keyPreview,
    });
  }

  return providers;
}

export async function addProvider(
  supabase: Client,
  accountId: string,
  providerId: AIProviderId,
  apiKey: string,
): Promise<void> {
  // Get current keys
  const { data, error } = await supabase
    .from("accounts")
    .select("encrypted_api_keys, model_config")
    .eq("id", accountId)
    .single();

  if (error) throw error;

  const existingKeys =
    (data.encrypted_api_keys as unknown as StoredAPIKeys) ?? {};
  const isFirstProvider = Object.keys(existingKeys).length === 0;

  // Encrypt the API key
  const encrypted = encrypt(apiKey);
  const keyPreview = apiKey.slice(-4);

  const updatedKeys: StoredAPIKeys = {
    ...existingKeys,
    [providerId]: {
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext,
      tag: encrypted.tag,
      keyPreview,
      addedAt: new Date().toISOString(),
    },
  };

  // Build update payload
  const updates: Record<string, unknown> = {
    encrypted_api_keys: updatedKeys,
  };

  // Set default model config if this is the first provider
  if (isFirstProvider) {
    const definition = getProviderDefinition(providerId);
    const defaultModel = definition?.models[0];
    const defaultVoice = definition?.voices[0];

    if (defaultModel && defaultVoice) {
      const config: AccountModelConfig = {
        voiceProvider: providerId,
        voiceModel: defaultModel.id,
        voiceName: defaultVoice.id,
      };
      updates.model_config = config;
    }
  }

  const { error: updateError } = await supabase
    .from("accounts")
    .update(updates)
    .eq("id", accountId);

  if (updateError) throw updateError;
}

export async function removeProvider(
  supabase: Client,
  accountId: string,
  providerId: AIProviderId,
): Promise<void> {
  const { data, error } = await supabase
    .from("accounts")
    .select("encrypted_api_keys, model_config")
    .eq("id", accountId)
    .single();

  if (error) throw error;

  const existingKeys =
    (data.encrypted_api_keys as unknown as StoredAPIKeys) ?? {};
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { [providerId]: _removed, ...remainingKeys } = existingKeys;

  const updates: Record<string, unknown> = {
    encrypted_api_keys:
      Object.keys(remainingKeys).length > 0 ? remainingKeys : null,
  };

  // Clear model_config if the removed provider was the active voice/game provider
  const modelConfig =
    data.model_config as unknown as AccountModelConfig | null;
  if (modelConfig) {
    let configChanged = false;
    const newConfig = { ...modelConfig };

    if (modelConfig.voiceProvider === providerId) {
      // Try to fall back to another provider
      const remaining = Object.keys(remainingKeys) as AIProviderId[];
      if (remaining.length > 0) {
        const fallback = getProviderDefinition(remaining[0]);
        if (fallback) {
          newConfig.voiceProvider = remaining[0];
          newConfig.voiceModel = fallback.models[0]?.id ?? "";
          newConfig.voiceName = fallback.voices[0]?.id ?? "";
          configChanged = true;
        }
      } else {
        updates.model_config = null;
        configChanged = true;
      }
    }

    if (modelConfig.gameProvider === providerId) {
      newConfig.gameProvider = undefined;
      newConfig.gameModel = undefined;
      configChanged = true;
    }

    if (modelConfig.thinkingProvider === providerId) {
      newConfig.thinkingProvider = undefined;
      newConfig.thinkingModel = undefined;
      configChanged = true;
    }

    if (configChanged && updates.model_config !== null) {
      updates.model_config = newConfig;
    }
  }

  const { error: updateError } = await supabase
    .from("accounts")
    .update(updates)
    .eq("id", accountId);

  if (updateError) throw updateError;
}

export async function getModelConfig(
  supabase: Client,
  accountId: string,
): Promise<AccountModelConfig | null> {
  const { data, error } = await supabase
    .from("accounts")
    .select("model_config")
    .eq("id", accountId)
    .single();

  if (error) throw error;
  return (data.model_config as unknown as AccountModelConfig) ?? null;
}

/**
 * Normalize old config shape (gameProvider/gameModel) to new shape
 * (thinkingProvider/thinkingModel). Applied at read time — no SQL migration needed.
 */
export function normalizeModelConfig(config: AccountModelConfig): AccountModelConfig {
  if (config.thinkingProvider) return config;

  // Migrate old gameProvider/gameModel to thinkingProvider/thinkingModel
  if (config.gameProvider || config.gameModel) {
    return {
      ...config,
      thinkingProvider: config.thinkingProvider ?? config.gameProvider,
      thinkingModel: config.thinkingModel ?? config.gameModel,
    };
  }

  return config;
}

export async function updateModelConfig(
  supabase: Client,
  accountId: string,
  config: AccountModelConfig,
): Promise<void> {
  const { error } = await supabase
    .from("accounts")
    .update({ model_config: config as unknown as Database["public"]["Tables"]["accounts"]["Update"]["model_config"] })
    .eq("id", accountId);

  if (error) throw error;
}

export async function decryptProviderKey(
  supabase: Client,
  accountId: string,
  providerId: AIProviderId,
): Promise<string> {
  const { data, error } = await supabase
    .from("accounts")
    .select("encrypted_api_keys")
    .eq("id", accountId)
    .single();

  if (error) throw error;

  const keys = data.encrypted_api_keys as unknown as StoredAPIKeys | null;
  if (!keys || !keys[providerId]) {
    throw new Error(`No API key found for provider: ${providerId}`);
  }

  const entry = keys[providerId];
  return decrypt({
    iv: entry.iv,
    ciphertext: entry.ciphertext,
    tag: entry.tag,
  });
}

export async function hasAnyProvider(
  supabase: Client,
  accountId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("accounts")
    .select("encrypted_api_keys")
    .eq("id", accountId)
    .single();

  if (error) throw error;

  const keys = data.encrypted_api_keys as unknown as StoredAPIKeys | null;
  return keys !== null && Object.keys(keys).length > 0;
}
