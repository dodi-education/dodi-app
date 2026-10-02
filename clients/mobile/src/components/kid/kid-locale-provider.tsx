import { type ReactNode, useEffect, useState } from "react";
import { IntlProvider, useLocale, useMessages } from "use-intl";
import { normalizeLocale } from "@dodi/intl/locales";
import { loadMessages, type Messages } from "@dodi/intl/messages";

import { useActiveKid } from "@/lib/use-active-kid";

/**
 * The kid view speaks the active kid's language (web: the `dodi-kid-locale`
 * cookie in i18n/resolve-locale); the parent area keeps the parent's. Until
 * the kid is known, the surrounding (parent) locale stays in effect.
 */
export function KidLocaleProvider({ children }: { children: ReactNode }) {
  const outerLocale = useLocale();
  const outerMessages = useMessages();
  const { activeKid } = useActiveKid();
  const locale = activeKid?.language ? normalizeLocale(activeKid.language) : null;
  const [loaded, setLoaded] = useState<{ locale: string; messages: Messages } | null>(null);

  useEffect(() => {
    if (!locale) return;
    let isCurrent = true;
    void loadMessages(locale).then((messages) => {
      if (isCurrent) setLoaded({ locale, messages });
    });
    return () => {
      isCurrent = false;
    };
  }, [locale]);

  // Always the same provider (switching trees would remount the kid view).
  const isKidLocale = locale !== null && loaded?.locale === locale;
  return (
    <IntlProvider
      locale={isKidLocale ? loaded.locale : outerLocale}
      messages={isKidLocale ? loaded.messages : outerMessages}
      timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
    >
      {children}
    </IntlProvider>
  );
}
