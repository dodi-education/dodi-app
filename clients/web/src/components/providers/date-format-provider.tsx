"use client";

/**
 * Resolves the active date/time preference once per render and hands call-sites
 * bound formatters via `useDateFormat()` — the client mirror of how `useLocale`
 * is consumed. Resolution is kid → account → context default, where the
 * context is derived from the route (parent area → "account", kid area →
 * "kid"). All formatting is client-side, so the timezone never leaves the
 * browser.
 */
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { readStoredDatePref } from "@/lib/date-prefs";
import { useAccountStore } from "@/stores/account-store";
import { useKidStore } from "@/stores/kid-store";
import { useVaultStore } from "@/stores/vault-store";
import {
  formatDate,
  formatDateOnly,
  formatDateTime,
  formatElapsed,
  formatTime,
  resolvePref,
  type DateFormatPref,
  type DateStyleId,
  type FormatContext,
  type StoredDatePreferences,
} from "@dodi/intl";

type DateInput = string | number | Date | null | undefined;

export interface DateFormatApi {
  /** The fully resolved preference in effect. */
  pref: DateFormatPref;
  locale: string;
  formatDateTime: (value: DateInput) => string;
  formatDate: (value: DateInput) => string;
  formatTime: (value: DateInput) => string;
  /** Birthdate-safe date-only formatting; defaults to the resolved date style. */
  formatDateOnly: (
    value: string | null | undefined,
    opts?: { dateStyle?: DateStyleId },
  ) => string | null;
  formatElapsed: (startIso: string, endIso: string | null) => string;
}

const DateFormatContext = createContext<DateFormatApi | null>(null);

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function DateFormatProvider({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const pathname = usePathname();
  const session = useVaultStore((s) => s.session);
  const accountStored = useAccountStore(
    (s) => (s.account?.date_preferences ?? null) as StoredDatePreferences | null,
  );
  const load = useAccountStore((s) => s.load);
  const kids = useKidStore((s) => s.list);

  const context: FormatContext = pathname?.startsWith("/parent")
    ? "account"
    : "kid";

  // Active kid is tracked via cookie. Read it only after mount (never in
  // the initial render) to avoid a hydration mismatch; reading it each render
  // then picks up a kid switch, which re-renders the tree via router.refresh.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  const activeKidId = mounted ? getCookie("dodi-active-kid") : null;

  useEffect(() => {
    void load();
  }, [load]);

  const accountPartial = useMemo(
    () => readStoredDatePref(accountStored, session),
    [accountStored, session],
  );

  const kidPartial = useMemo(() => {
    if (context !== "kid" || !activeKidId || !kids) return null;
    const active = kids.find((p) => p.id === activeKidId);
    const stored = active?.date_preferences as
      | StoredDatePreferences
      | null
      | undefined;
    return readStoredDatePref(stored, session);
  }, [context, activeKidId, kids, session]);

  const pref = useMemo(
    () => resolvePref(locale, context, accountPartial, kidPartial),
    [locale, context, accountPartial, kidPartial],
  );

  const api = useMemo<DateFormatApi>(
    () => ({
      pref,
      locale,
      formatDateTime: (value) => formatDateTime(value, { locale, pref }),
      formatDate: (value) => formatDate(value, { locale, pref }),
      formatTime: (value) => formatTime(value, { locale, pref }),
      formatDateOnly: (value, opts) =>
        formatDateOnly(value, {
          locale,
          dateStyle: opts?.dateStyle ?? pref.dateStyle,
        }),
      formatElapsed,
    }),
    [pref, locale],
  );

  return (
    <DateFormatContext.Provider value={api}>
      {children}
    </DateFormatContext.Provider>
  );
}

export function useDateFormat(): DateFormatApi {
  const ctx = useContext(DateFormatContext);
  if (!ctx) {
    throw new Error("useDateFormat must be used within a DateFormatProvider");
  }
  return ctx;
}
