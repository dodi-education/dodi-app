"use client";

import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";

import type { ListingText } from "@dodi/client-state/game-publication";
import {
  flaggedListingLocales,
  languageDisplayName,
  sortListingLocales,
} from "@dodi/client-state/listing-checks";

import { Input } from "@/components/ui/input";
import { ListingSameTextWarning } from "@/components/parent/games/listing-same-text-warning";
import { cn } from "@/lib/utils";
import { listingTranslations, studioSettings, studioTextarea } from "@dodi/ui-recipes";

/** Deep-link anchor: the publish dialog's "Open in studio" lands here. */
const ANCHOR_ID = "translations";

interface ListingTranslationsFieldProps {
  entries: Record<string, ListingText>;
  /** The game's own (the child's) language, marked on its card. */
  sourceLocale: string | null;
  onChange: (locale: string, entry: ListingText) => void;
}

/**
 * The per-language dodi Discover listing texts, made when the game is first
 * published. Where a review's translation findings get fixed; hidden until a
 * translation exists.
 */
export function ListingTranslationsField({
  entries,
  sourceLocale,
  onChange,
}: ListingTranslationsFieldProps) {
  const t = useTranslations("gameStudio");
  const uiLocale = useLocale();
  const sectionRef = useRef<HTMLDivElement>(null);

  // Game language first, then the rest alphabetically.
  const locales = sortListingLocales(entries, sourceLocale);
  const hasEntries = locales.length > 0;

  useEffect(() => {
    if (hasEntries && window.location.hash === `#${ANCHOR_ID}`) {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [hasEntries]);

  if (!hasEntries) return null;

  const flagged = flaggedListingLocales(entries);

  return (
    <div ref={sectionRef} id={ANCHOR_ID} className={cn(listingTranslations.webRoot, listingTranslations.root)}>
      <label className={studioSettings.label}>{t("listingTranslations")}</label>
      <p className={studioSettings.hint}>{t("listingTranslationsHint")}</p>
      <ListingSameTextWarning translations={entries} />
      <div className={cn(listingTranslations.webList, listingTranslations.list)}>
        {locales.map((locale) => {
          const entry = entries[locale];
          const name = languageDisplayName(locale, uiLocale);
          return (
            <div
              key={locale}
              className={cn(listingTranslations.webCard, listingTranslations.card)}
            >
              <span className={studioSettings.label}>
                {name}
                {locale === sourceLocale && (
                  <span className={listingTranslations.gameLanguage}>
                    {t("listingTranslationGameLanguage")}
                  </span>
                )}
              </span>
              <Input
                value={entry.title}
                maxLength={200}
                placeholder={t("listingTranslationTitlePlaceholder")}
                aria-label={t("publishTranslatedTitle", { locale: name })}
                onChange={(e) => onChange(locale, { ...entry, title: e.target.value })}
              />
              <textarea
                value={entry.description}
                maxLength={5000}
                rows={3}
                aria-label={t("publishTranslatedDescription", { locale: name })}
                className={cn(
                  studioTextarea.box,
                  studioTextarea.text,
                  studioTextarea.web,
                  flagged.has(locale) && listingTranslations.flagged,
                )}
                onChange={(e) => onChange(locale, { ...entry, description: e.target.value })}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
