/**
 * Map a stored `date_preferences` blob (the account/profile jsonb column) into
 * an in-memory partial preference. The date/time styles are plaintext; the
 * timezone, when set, is sealed (`enc:v1:`) and decrypted with the VaultSession
 * so the server never sees the plaintext zone.
 */
import type { PartialDateFormatPref, StoredDatePreferences } from "@dodi/intl";
import type { VaultSession } from "@dodi/vault";

export function readStoredDatePref(
  stored: StoredDatePreferences | null | undefined,
  session: VaultSession | null,
): PartialDateFormatPref {
  if (!stored) return {};
  const pref: PartialDateFormatPref = {};
  if (stored.dateStyle) pref.dateStyle = stored.dateStyle;
  if (stored.timeStyle) pref.timeStyle = stored.timeStyle;
  if (stored.timeZoneEnc && session) {
    try {
      const zone = session.decryptField(stored.timeZoneEnc);
      if (zone) pref.timeZone = zone;
    } catch {
      // Vault not ready / decrypt failed — leave the zone unset so it falls
      // through to the next level (ultimately "auto"); corrects once unlocked.
    }
  }
  return pref;
}
