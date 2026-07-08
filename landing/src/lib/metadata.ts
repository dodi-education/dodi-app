import type { Metadata } from "next";

import { messages } from "@/i18n/messages";
import { SITE_URL, localePath, type Locale } from "@/lib/site";

/**
 * Per-locale page metadata with `hreflang` alternates. `x-default` points at the
 * English root so crawlers pick a sensible default. `metadataBase` makes the
 * relative alternate/canonical paths resolve to absolute URLs. Title and
 * description come from the per-locale `meta` catalogue.
 */
export function buildMetadata(locale: Locale): Metadata {
  const { title, description } = messages[locale].meta;

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    icons: { icon: "/site/assets/dodi-head.png" },
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
      siteName: "dodi",
      title,
      description,
      url: localePath[locale],
      locale: locale === "de" ? "de_DE" : "en_US",
    },
  };
}

/**
 * Metadata for an interior page (App / Companion / About). Title and
 * description come from that page's message namespace; canonical/hreflang point
 * at the locale-prefixed route (e.g. /app and /de/app).
 */
export function buildPageMetadata(
  locale: Locale,
  page: "app" | "companion" | "about" | "pricing",
): Metadata {
  const ns = messages[locale][page];
  const title = ns.metaTitle;
  const description = ns.metaDescription;
  const enPath = `/${page}`;
  const dePath = `/de/${page}`;
  const path = locale === "de" ? dePath : enPath;

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    icons: { icon: "/site/assets/dodi-head.png" },
    alternates: {
      canonical: path,
      languages: { en: enPath, de: dePath, "x-default": enPath },
    },
    openGraph: {
      type: "website",
      siteName: "dodi",
      title,
      description,
      url: path,
      locale: locale === "de" ? "de_DE" : "en_US",
    },
  };
}
