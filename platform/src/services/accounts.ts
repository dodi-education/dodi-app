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

/**
 * Plaintext account-level notification toggles (opt-out; unset ⇒ on). Kept
 * plaintext deliberately: the server reads these to decide whether to send
 * transactional email. Extend this shape as more notification types are added.
 */
export interface NotificationPreferences {
  friend_approval_email?: boolean;
  /** Outcome of a dodi Discover publication review (approved/rejected). */
  publication_outcome_email?: boolean;
}

/**
 * Merge partial notification toggles into the account's stored preferences (so
 * updating one toggle never clobbers the others) and return the merged result.
 */
export async function updateAccountNotificationPreferences(
  supabase: Client,
  accountId: string,
  prefs: NotificationPreferences,
): Promise<NotificationPreferences> {
  const { data: existing, error: readError } = await supabase
    .from("accounts")
    .select("notification_preferences")
    .eq("id", accountId)
    .single();
  if (readError) throw readError;

  const current = (existing?.notification_preferences ??
    {}) as NotificationPreferences;
  const merged: NotificationPreferences = { ...current, ...prefs };

  const { error } = await supabase
    .from("accounts")
    .update({
      notification_preferences:
        merged as unknown as AccountUpdate["notification_preferences"],
    })
    .eq("id", accountId);
  if (error) throw error;

  return merged;
}

/**
 * Set the account's PUBLIC publication handle — the author byline on games
 * published to dodi Discover. Plaintext on purpose: every real name in dodi is
 * E2EE, so a listing can only credit a name the parent deliberately chose for
 * publication (same reasoning as `kids.social_id`). Expects an already-validated,
 * normalized handle. Returns false on a uniqueness collision so the caller can
 * answer 409 rather than 500.
 */
export async function setAccountPublicationHandle(
  supabase: Client,
  accountId: string,
  handle: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("accounts")
    .update({ publication_handle: handle } as AccountUpdate)
    .eq("id", accountId);

  // 23505 = unique_violation → the handle is taken.
  if (error && error.code === "23505") return false;
  if (error) throw error;
  return true;
}

/**
 * Whether a handle is free. Needs the service-role client: RLS scopes account
 * reads to the caller, and a "taken?" answer must span every account. Returns
 * only a boolean — never a browsable list, same contract as friend lookup.
 */
export async function isPublicationHandleAvailable(
  serviceSupabase: Client,
  handle: string,
): Promise<boolean> {
  const { data, error } = await serviceSupabase
    .from("accounts")
    .select("id")
    .eq("publication_handle", handle)
    .maybeSingle();
  if (error) throw error;
  return data === null;
}

/**
 * Set or clear the account's parent PIN. The value, when present, is already
 * sealed (`enc:v1:`) by the client; `null` removes the PIN. The server never
 * sees the plaintext — it only stores/returns the opaque blob.
 */
export async function updateAccountParentPin(
  supabase: Client,
  accountId: string,
  parentPinEnc: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("accounts")
    .update({ parent_pin_enc: parentPinEnc } as AccountUpdate)
    .eq("id", accountId);

  if (error) throw error;
}
