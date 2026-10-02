/**
 * UI strings: the shared catalogs (core/intl/messages) through use-intl, the
 * same message format and keys next-intl uses on the web. The locale follows
 * the account's saved language once signed in, else the device language.
 */
import { getLocales } from "expo-localization";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { IntlProvider } from "use-intl";
import { normalizeLocale, type Locale } from "@dodi/intl/locales";
import { loadMessages, type Messages } from "@dodi/intl/messages";

import { useAccountStore } from "@/lib/client-state";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocaleSetting(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocaleSetting outside LocaleProvider");
  return value;
}

function deviceLocale(): Locale {
  return normalizeLocale(getLocales()[0]?.languageCode);
}

export function LocaleProvider({ children }: { children: ReactNode }): ReactNode {
  const accountLanguage = useAccountStore((s) => s.account?.language ?? null);
  // An explicit choice on this device wins; else the account's saved language
  // (it follows the parent to new devices), else the device language.
  const [chosenLocale, setLocale] = useState<Locale | null>(null);
  const locale = chosenLocale ?? (accountLanguage ? normalizeLocale(accountLanguage) : deviceLocale());
  const [messages, setMessages] = useState<Messages | null>(null);

  useEffect(() => {
    let isCurrent = true;
    void loadMessages(locale).then((loaded) => {
      if (isCurrent) setMessages(loaded);
    });
    return () => {
      isCurrent = false;
    };
  }, [locale]);

  if (!messages) return null;
  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <IntlProvider locale={locale} messages={messages} timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}>
        {children}
      </IntlProvider>
    </LocaleContext.Provider>
  );
}
