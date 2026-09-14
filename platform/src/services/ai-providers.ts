import type { Json } from "@dodi/types/database";
import type { AccountModelConfig } from "@dodi/types/ai";

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
  return row.encrypted_api_keys;
}

export async function setEncryptedProviders(
  db: Db,
  accountId: string,
  blob: string,
): Promise<void> {
  await db
    .updateTable("accounts")
    .set({ encrypted_api_keys: blob })
    .where("id", "=", accountId)
    .execute();
}

/**
 * Provider removal is a CLIENT operation: the browser decrypts the blob, drops
 * the entry and re-seals the whole map (see `providers-store.removeKey`), then
 * PUTs it through {@link setEncryptedProviders}. There is deliberately no
 * server-side remove — the server cannot see which providers the blob holds.
 */

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
