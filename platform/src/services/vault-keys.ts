/**
 * Server-side persistence of the account's wrapped vault keys.
 *
 * The blobs are opaque to the server — it stores and returns them verbatim and
 * cannot derive the VMK from them. RLS (`app.current_account_id() = id`) scopes
 * access to the owning account.
 */
import type { Json } from "@dodi/types/database";
import type { StoredVaultKeys } from "@dodi/vault";

import type { Db } from "@/lib/db";

export async function getStoredVaultKeys(
  db: Db,
  accountId: string,
): Promise<StoredVaultKeys | null> {
  const row = await db
    .selectFrom("accounts")
    .select("vault_keys")
    .where("id", "=", accountId)
    .executeTakeFirstOrThrow();
  return (row.vault_keys as unknown as StoredVaultKeys | null) ?? null;
}

export async function setStoredVaultKeys(
  db: Db,
  accountId: string,
  keys: StoredVaultKeys,
): Promise<void> {
  const rows = await db
    .updateTable("accounts")
    .set({ vault_keys: keys as unknown as Json })
    .where("id", "=", accountId)
    .returning("id")
    .execute();

  // An UPDATE that matches zero rows succeeds with an empty result — it does
  // NOT error. Without this guard a missing accounts row would silently drop
  // the vault keys, leaving the user locked out on next load. Fail loudly.
  if (rows.length === 0) {
    throw new Error(
      `Failed to store vault keys: no accounts row for id ${accountId}`,
    );
  }
}
