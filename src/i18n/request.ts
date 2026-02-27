import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

import { defaultLocale, locales, type Locale } from "./config";

function parseAcceptLanguage(header: string): Locale | null {
  const parts = header.split(",");
  for (const part of parts) {
    const lang = part.split(";")[0].trim().split("-")[0].toLowerCase();
    if (locales.includes(lang as Locale)) {
      return lang as Locale;
    }
  }
  return null;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();

  let locale: Locale = defaultLocale;

  // 1. Kid view: check dodi-kid-locale cookie
  const viewCookie = cookieStore.get("dodi-view")?.value;
  if (viewCookie === "kid") {
    const kidLocale = cookieStore.get("dodi-kid-locale")?.value;
    if (kidLocale && locales.includes(kidLocale as Locale)) {
      locale = kidLocale as Locale;
      return {
        locale,
        messages: (await import(`./messages/${locale}.json`)).default,
      };
    }
  }

  // 2. Check NEXT_LOCALE cookie (user preference)
  const localeCookie = cookieStore.get("NEXT_LOCALE")?.value;
  if (localeCookie && locales.includes(localeCookie as Locale)) {
    locale = localeCookie as Locale;
    return {
      locale,
      messages: (await import(`./messages/${locale}.json`)).default,
    };
  }

  // 3. Fallback: parse Accept-Language header
  const acceptLanguage = headerStore.get("accept-language");
  if (acceptLanguage) {
    const detected = parseAcceptLanguage(acceptLanguage);
    if (detected) {
      locale = detected;
    }
  }

  // 4. Final fallback: defaultLocale ("en")
  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
