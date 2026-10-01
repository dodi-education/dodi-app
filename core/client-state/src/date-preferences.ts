/**
 * The account's date/time display preference: reading the stored blob (the
 * timezone is sealed, decrypted with the VaultSession) and saving it (styles
 * plaintext, an explicit timezone sealed so the server never learns the
 * family's zone).
 *
 * The style ids are `@dodi/intl`'s (`DateStyleId`, `TimeStyleId`); this
 * package doesn't depend on it, so the shapes are generic over them.
 */
import type { Json } from "@dodi/types/database";
import type { VaultSession } from "@dodi/vault";

import { patchAccount } from "./account-settings";
import type { AccountStore } from "./account-store";
import type { PlatformApi } from "./platform";
import type { VaultStore } from "./vault-store";

/** The stored `date_preferences` jsonb (`@dodi/intl` StoredDatePreferences). */
export interface StoredDatePrefs<D extends string = string, T extends string = string> {
  dateStyle?: D;
  timeStyle?: T;
  /** `enc:v1:` sealed IANA timezone; null/absent means automatic. */
  timeZoneEnc?: string | null;
}

/** A sparse in-memory preference (`@dodi/intl` PartialDateFormatPref). */
export interface PartialDatePref<D extends string = string, T extends string = string> {
  dateStyle?: D;
  timeStyle?: T;
  timeZone?: string;
}

/**
 * Map a stored `date_preferences` blob (account or kid jsonb column) into an
 * in-memory partial preference. A sealed timezone that can't be opened yet
 * stays unset, so it falls through to the next level until the vault opens.
 */
export function readStoredDatePref<D extends string, T extends string>(
  stored: StoredDatePrefs<D, T> | null | undefined,
  session: VaultSession | null,
): PartialDatePref<D, T> {
  if (!stored) return {};
  const pref: PartialDatePref<D, T> = {};
  if (stored.dateStyle) pref.dateStyle = stored.dateStyle;
  if (stored.timeStyle) pref.timeStyle = stored.timeStyle;
  if (stored.timeZoneEnc && session) {
    try {
      const zone = session.decryptField(stored.timeZoneEnc);
      if (zone) pref.timeZone = zone;
    } catch {
      // Vault not ready / decrypt failed: corrects once unlocked.
    }
  }
  return pref;
}

/** The settings form's values: `timeZone` is "auto" or an IANA id. */
export interface DateSettingsDraft<D extends string = string, T extends string = string> {
  dateStyle: D;
  timeStyle: T;
  timeZone: string;
}

/**
 * The form's initial values from the stored account preference, or null while
 * a sealed timezone still waits for the vault.
 */
export function initialDateSettings<D extends string, T extends string>(
  stored: StoredDatePrefs<D, T> | null,
  session: VaultSession | null,
  base: { dateStyle: D; timeStyle: T },
): DateSettingsDraft<D, T> | null {
  if (stored?.timeZoneEnc && !session) return null;
  let timeZone = "auto";
  if (stored?.timeZoneEnc && session) {
    try {
      timeZone = session.decryptField(stored.timeZoneEnc) ?? "auto";
    } catch {
      timeZone = "auto";
    }
  }
  return {
    dateStyle: stored?.dateStyle ?? base.dateStyle,
    timeStyle: stored?.timeStyle ?? base.timeStyle,
    timeZone,
  };
}

export type DateSettingsError =
  | { key: "dateVaultLocked" | "dateSaveFailed" }
  /** The server's (or the network's) own message. */
  | { message: string };

/**
 * Save the account's date preference and mirror it into the cached account.
 * Null on success.
 */
export async function saveDateSettings(
  deps: { api: PlatformApi; account: AccountStore; vault: VaultStore },
  draft: DateSettingsDraft,
): Promise<DateSettingsError | null> {
  let timeZoneEnc: string | null = null;
  if (draft.timeZone !== "auto") {
    const session = deps.vault.getState().session;
    if (!session) return { key: "dateVaultLocked" };
    try {
      timeZoneEnc = session.encryptField(draft.timeZone);
    } catch (e) {
      return e instanceof Error ? { message: e.message } : { key: "dateSaveFailed" };
    }
  }
  const datePreferences: StoredDatePrefs = {
    dateStyle: draft.dateStyle,
    timeStyle: draft.timeStyle,
    timeZoneEnc,
  };
  try {
    const res = await patchAccount(deps.api, { datePreferences });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      return data?.error ? { message: data.error } : { key: "dateSaveFailed" };
    }
  } catch (e) {
    return e instanceof Error && e.message ? { message: e.message } : { key: "dateSaveFailed" };
  }
  deps.account.getState().patchLocal({ date_preferences: datePreferences as unknown as Json });
  return null;
}

/** The runtime's IANA timezones ([] where `Intl.supportedValuesOf` is missing). */
export function listTimeZones(): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };
  try {
    return intl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}
