import type { SupabaseClient } from "@supabase/supabase-js";

import type { StoredDatePreferences } from "@dodi/intl";
import type { Database } from "@dodi/types/database";

type Client = SupabaseClient<Database>;
type Account = Database["public"]["Tables"]["accounts"]["Row"];
type AccountUpdate = Database["public"]["Tables"]["accounts"]["Update"];

export async function getAccount(
  supabase: Client,
  accountId: string,
): Promise<Account | null> {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  // Type assertion needed until types are auto-generated from Supabase
  return data as unknown as Account;
}

export async function updateAccount(
  supabase: Client,
  accountId: string,
  updates: AccountUpdate,
): Promise<Account> {
  const { data, error } = await supabase
    .from("accounts")
    .update(updates)
    .eq("id", accountId)
    .select()
    .single();

  if (error) throw error;
  // Type assertion needed until types are auto-generated from Supabase
  return data as unknown as Account;
}

/**
 * Persist the parent's UI language (BCP-47 short code, e.g. "en"/"de"). This is
 * the durable source of truth; the client caches it in the `NEXT_LOCALE` cookie
 * and re-seeds that cookie from here at login so the choice follows the parent
 * across devices.
 */
export async function updateAccountLanguage(
  supabase: Client,
  accountId: string,
  language: string,
): Promise<void> {
  const { error } = await supabase
    .from("accounts")
    .update({ language } as AccountUpdate)
    .eq("id", accountId);

  if (error) throw error;
}

/**
 * Replace the account's date/time display preferences (the settings form submits
 * the full object, which becomes the entire `date_preferences` column). The
 * explicit timezone, when present, is already sealed (`enc:v1:`) by the client.
 */
export async function updateAccountDatePreferences(
  supabase: Client,
  accountId: string,
  datePreferences: StoredDatePreferences,
): Promise<StoredDatePreferences> {
  const { error } = await supabase
    .from("accounts")
    .update({
      date_preferences:
        datePreferences as unknown as AccountUpdate["date_preferences"],
    })
    .eq("id", accountId);

  if (error) throw error;
  return datePreferences;
}
