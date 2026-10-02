/**
 * The kid view's date formatting (web: providers/date-format-provider in the
 * "kid" context): the active kid's preference over the account's over the kid
 * locale's default. Sealed timezones open with the VaultSession, on the device.
 */
import { useEffect, useMemo } from "react";
import { useLocale } from "use-intl";
import { readStoredDatePref } from "@dodi/client-state/date-preferences";
import { formatDate, formatDateOnly, formatDateTime } from "@dodi/intl/format";
import { type DateFormatPref, resolvePref, type StoredDatePreferences } from "@dodi/intl/prefs";

import { useAccountStore, useVaultStore } from "@/lib/client-state";
import { useActiveKid } from "@/lib/use-active-kid";

type DateInput = string | number | Date | null | undefined;

export interface KidDateFormat {
  pref: DateFormatPref;
  formatDateTime: (value: DateInput) => string;
  formatDate: (value: DateInput) => string;
  /** A calendar date (`YYYY-MM-DD`, no timezone shift), null when unset. */
  formatDateOnly: (value: string | null | undefined) => string | null;
  locale: string;
}

export function useKidDateFormat(): KidDateFormat {
  const locale = useLocale();
  const session = useVaultStore((s) => s.session);
  const accountStored = useAccountStore((s) => (s.account?.date_preferences ?? null) as StoredDatePreferences | null);
  const load = useAccountStore((s) => s.load);
  const { activeKid } = useActiveKid();
  const kidStored = (activeKid?.date_preferences ?? null) as StoredDatePreferences | null;

  useEffect(() => {
    void load();
  }, [load]);

  return useMemo(() => {
    const pref = resolvePref(
      locale,
      "kid",
      readStoredDatePref(accountStored, session),
      readStoredDatePref(kidStored, session),
    );
    return {
      pref,
      formatDateTime: (value) => formatDateTime(value, { locale, pref }),
      formatDate: (value) => formatDate(value, { locale, pref }),
      formatDateOnly: (value) => formatDateOnly(value, { locale, dateStyle: pref.dateStyle }),
      locale,
    };
  }, [locale, accountStored, kidStored, session]);
}
