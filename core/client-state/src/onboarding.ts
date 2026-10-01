/**
 * Onboarding, right after the account key: the account-level basics that are
 * wrong by default outside en-US (UI language, date/time formats, timezone).
 * The chosen timezone is sealed with the VaultSession before it is saved: the
 * server never learns the family's zone ("auto" saves nothing).
 */
import type { Json } from "@dodi/types/database";

import type { AccountStore } from "./account-store";
import type { PlatformApi } from "./platform";
import type { VaultStore } from "./vault-store";

/**
 * Message keys the save can answer with: `settings.dateVaultLocked` (no
 * session to seal the timezone with) or `onboarding.saveFailed`.
 */
export type OnboardingErrorKey = "dateVaultLocked" | "saveFailed";

export interface AccountPreferencesInput {
  /** A `DateStyleId` of @dodi/intl. */
  dateStyle: string;
  /** A `TimeStyleId` of @dodi/intl. */
  timeStyle: string;
  /** "auto" (device zone, nothing stored) or an IANA id (sealed). */
  timeZone: string;
  /** The UI language the parent is looking at. */
  language: string;
}

/** The `date_preferences` column shape (`StoredDatePreferences` of @dodi/intl). */
export interface StoredAccountDatePreferences {
  dateStyle: string;
  timeStyle: string;
  timeZoneEnc: string | null;
}

/** Save the preferences on the account and mirror them into the cached row. Null on success. */
export async function saveAccountPreferences(
  deps: { api: PlatformApi; account: AccountStore; vault: VaultStore },
  input: AccountPreferencesInput,
): Promise<OnboardingErrorKey | null> {
  let timeZoneEnc: string | null = null;
  if (input.timeZone !== "auto") {
    const session = deps.vault.getState().session;
    if (!session) return "dateVaultLocked";
    try {
      timeZoneEnc = session.encryptField(input.timeZone);
    } catch {
      return "saveFailed";
    }
  }
  const datePreferences: StoredAccountDatePreferences = {
    dateStyle: input.dateStyle,
    timeStyle: input.timeStyle,
    timeZoneEnc,
  };
  try {
    const res = await deps.api.request("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datePreferences, language: input.language }),
    });
    if (!res.ok) return "saveFailed";
  } catch {
    return "saveFailed";
  }
  deps.account.getState().patchLocal({
    date_preferences: datePreferences as unknown as Json,
    language: input.language,
  });
  return null;
}

/**
 * Persist a UI language pick on the account (best effort) so it follows the
 * parent to their other devices, and mirror it into the cached row. Without a
 * session the request fails and the choice stays device-local.
 */
export async function persistLanguage(
  deps: { api: PlatformApi; account: AccountStore },
  language: string,
): Promise<void> {
  try {
    const res = await deps.api.request("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language }),
    });
    if (res.ok) deps.account.getState().patchLocal({ language });
  } catch {
    // Device-local only.
  }
}
