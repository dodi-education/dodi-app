import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@dodi/types/database";
import type {
  AIProviderId,
  AccountModelConfig,
  StoredAPIKeys,
} from "@dodi/types/ai";
import { getProviderDefinition } from "@dodi/ai/providers";

type Client = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// E2EE provider keys: `accounts.encrypted_api_keys` now holds a single opaque
// blob the CLIENT sealed under the account VMK. The server stores/returns it
// verbatim and can never read a key — there is no server-side decryption path.
// (See core/vault/src/api-keys-crypto.ts for the client-side sealing.)
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

    if (modelConfig.imageProvider === providerId) {
      newConfig.imageProvider = undefined;
      newConfig.imageModel = undefined;
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

/** Reset the account to the unconfigured state (dodi AI disabled, no BYOK fallback). */
export async function clearModelConfig(
  supabase: Client,
  accountId: string,
): Promise<void> {
  const { error } = await supabase
    .from("accounts")
    .update({ model_config: null })
    .eq("id", accountId);

  if (error) throw error;
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
