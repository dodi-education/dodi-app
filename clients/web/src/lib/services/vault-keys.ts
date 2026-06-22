/**
 * Server-side persistence of the account's wrapped vault keys.
 *
 * The blobs are opaque to the server — it stores and returns them verbatim and
 * cannot derive the VMK from them. RLS (`auth.uid() = id`) scopes access to the
 * owning account.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import type { StoredVaultKeys } from "@/lib/vault";

type Client = SupabaseClient<Database>;

export async function getStoredVaultKeys(
  supabase: Client,
  accountId: string,
): Promise<StoredVaultKeys | null> {
  const { data, error } = await supabase
    .from("accounts")
    .select("vault_keys")
    .eq("id", accountId)
    .single();

  if (error) throw error;
  return (data.vault_keys as unknown as StoredVaultKeys | null) ?? null;
}

export async function setStoredVaultKeys(
  supabase: Client,
  accountId: string,
  keys: StoredVaultKeys,
): Promise<void> {
  const { data, error } = await supabase
    .from("accounts")
    .update({
      vault_keys: keys as unknown as Database["public"]["Tables"]["accounts"]["Update"]["vault_keys"],
    })
    .eq("id", accountId)
    .select("id");

  if (error) throw error;

  // A PostgREST UPDATE that matches zero rows succeeds with an empty result —
  // it does NOT error. Without this guard a missing accounts row would silently
  // drop the vault keys, leaving the user locked out on next load. Fail loudly.
  if (!data || data.length === 0) {
    throw new Error(
      `Failed to store vault keys: no accounts row for id ${accountId}`,
    );
  }
}
