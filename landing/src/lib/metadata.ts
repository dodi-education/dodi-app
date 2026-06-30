import type { Metadata } from "next";

import { messages } from "@/i18n/messages";
import { SITE_URL, localePath, type Locale } from "@/lib/site";

const titles: Record<Locale, string> = {
  en: "Dodi — AI Learning Companion for Kids",
  de: "Dodi — KI-Lernbegleiter für Kinder",
};

/**
 * Per-locale page metadata with `hreflang` alternates. `x-default` points at the
 * English root so crawlers pick a sensible default. `metadataBase` makes the
 * relative alternate/canonical paths resolve to absolute URLs.
 */
export function buildMetadata(locale: Locale): Metadata {
  const title = titles[locale];
  const description = messages[locale].landing.heroSubtitle;

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: {
      canonical: localePath[locale],
      languages: {
        en: localePath.en,
        de: localePath.de,
        "x-default": localePath.en,
      },
    },
    openGraph: {
      type: "website",
      siteName: "Dodi",
      title,
      description,
      url: localePath[locale],
      locale: locale === "de" ? "de_DE" : "en_US",
    },
  };
}
