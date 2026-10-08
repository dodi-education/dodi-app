import { getLocale, getTranslations } from "next-intl/server";

import { authLayout } from "@dodi/ui-recipes";
import { SETTINGS_LEGAL_PAGES } from "@dodi/client-state/legal-links";

import { siteUrl } from "@/lib/site-links";
import { cn } from "@/lib/utils";

const LABEL_KEYS: Record<(typeof SETTINGS_LEGAL_PAGES)[number], string> = {
  privacy: "legalPrivacy",
  terms: "legalTerms",
  imprint: "legalImprint",
};

/** Privacy policy, terms and imprint under the sign-in / sign-up card. */
export async function AuthLegalLinks() {
  const t = await getTranslations("settings");
  const locale = await getLocale();
  return (
    <nav aria-label={t("legalTitle")} className={cn(authLayout.legal, "flex")}>
      {SETTINGS_LEGAL_PAGES.map((page) => (
        <a
          key={page}
          href={siteUrl(page, locale)}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(authLayout.legalLink, authLayout.webLegalLink)}
        >
          {t(LABEL_KEYS[page])}
        </a>
      ))}
    </nav>
  );
}
