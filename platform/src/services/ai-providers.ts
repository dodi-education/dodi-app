import type { Json } from "@dodi/types/database";
import type {
  AIProviderId,
  AccountModelConfig,
  StoredAPIKeys,
} from "@dodi/types/ai";
import { getProviderDefinition } from "@dodi/ai/providers";

import type { Db } from "@/lib/db";

// ---------------------------------------------------------------------------
// E2EE provider keys: `accounts.encrypted_api_keys` now holds a single opaque
// blob the CLIENT sealed under the account VMK. The server stores/returns it
// verbatim and can never read a key — there is no server-side decryption path.
// (See core/vault/src/api-keys-crypto.ts for the client-side sealing.)
// ---------------------------------------------------------------------------

export async function getEncryptedProviders(
  db: Db,
  accountId: string,
): Promise<string | null> {
  const row = await db
    .selectFrom("accounts")
    .select("encrypted_api_keys")
    .where("id", "=", accountId)
    .executeTakeFirstOrThrow();
  return (row.encrypted_api_keys as unknown as string | null) ?? null;
}

export async function setEncryptedProviders(
  db: Db,
  accountId: string,
  blob: string,
): Promise<void> {
  await db
    .updateTable("accounts")
    .set({ encrypted_api_keys: blob as unknown as Json })
    .where("id", "=", accountId)
    .execute();
}

export async function removeProvider(
  db: Db,
  accountId: string,
  providerId: AIProviderId,
): Promise<void> {
  const row = await db
    .selectFrom("accounts")
    .select(["encrypted_api_keys", "model_config"])
    .where("id", "=", accountId)
    .executeTakeFirstOrThrow();

  const existingKeys =
    (row.encrypted_api_keys as unknown as StoredAPIKeys) ?? {};
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { [providerId]: _removed, ...remainingKeys } = existingKeys;

  const updates: { encrypted_api_keys: Json | null; model_config?: Json | null } = {
    encrypted_api_keys:
      Object.keys(remainingKeys).length > 0
        ? (remainingKeys as unknown as Json)
        : null,
  };

  // Clear model_config if the removed provider was the active voice/game provider
  const modelConfig = row.model_config as unknown as AccountModelConfig | null;
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
      updates.model_config = newConfig as unknown as Json;
    }
  }

  await db
    .updateTable("accounts")
    .set(updates)
    .where("id", "=", accountId)
    .execute();
}

export async function getModelConfig(
  db: Db,
  accountId: string,
): Promise<AccountModelConfig | null> {
  const row = await db
    .selectFrom("accounts")
    .select("model_config")
    .where("id", "=", accountId)
    .executeTakeFirstOrThrow();
  return (row.model_config as unknown as AccountModelConfig) ?? null;
}

/** Reset the account to the unconfigured state (dodi AI disabled, no BYOK fallback). */
export async function clearModelConfig(
  db: Db,
  accountId: string,
): Promise<void> {
  await db
    .updateTable("accounts")
    .set({ model_config: null })
    .where("id", "=", accountId)
    .execute();
}

export async function updateModelConfig(
  db: Db,
  accountId: string,
  config: AccountModelConfig,
): Promise<void> {
  await db
    .updateTable("accounts")
    .set({ model_config: config as unknown as Json })
    .where("id", "=", accountId)
    .execute();
}
