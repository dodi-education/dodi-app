/**
 * The parent area's date formatting (web: providers/date-format-provider in
 * the "account" context): the account's preference over the locale default.
 * A sealed timezone opens with the VaultSession, on the device only.
 */
import { useMemo } from "react";
import { readStoredDatePref } from "@dodi/client-state/date-preferences";
import { formatDate, formatDateTime } from "@dodi/intl/format";
import { type DateFormatPref, resolvePref, type StoredDatePreferences } from "@dodi/intl/prefs";

import { useAccountStore, useVaultStore } from "@/lib/client-state";
import { useLocaleSetting } from "@/lib/intl";

type DateInput = string | number | Date | null | undefined;

export interface AccountDateFormat {
  pref: DateFormatPref;
  formatDateTime: (value: DateInput) => string;
  formatDate: (value: DateInput) => string;
}

export function useAccountDateFormat(): AccountDateFormat {
  const { locale } = useLocaleSetting();
  const session = useVaultStore((s) => s.session);
  const stored = useAccountStore(
    (s) => (s.account?.date_preferences ?? null) as StoredDatePreferences | null,
  );

  return useMemo(() => {
    const pref = resolvePref(locale, "account", readStoredDatePref(stored, session));
    return {
      pref,
      formatDateTime: (value) => formatDateTime(value, { locale, pref }),
      formatDate: (value) => formatDate(value, { locale, pref }),
    };
  }, [locale, stored, session]);
}
