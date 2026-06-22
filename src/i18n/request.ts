import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

import { resolveLocale } from "./resolve-locale";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const locale = resolveLocale({
    pathname: headerStore.get("x-pathname"),
    view: cookieStore.get("dodi-view")?.value,
    kidLocale: cookieStore.get("dodi-kid-locale")?.value,
    userLocale: cookieStore.get("NEXT_LOCALE")?.value,
    acceptLanguage: headerStore.get("accept-language"),
  });

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
