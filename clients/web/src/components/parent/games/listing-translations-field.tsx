"use client";

import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { ListingSameTextWarning } from "@/components/parent/games/listing-same-text-warning";
import type { ListingText } from "@/lib/ai/client-translate-game";
import { findSameDescriptionGroups, languageDisplayName } from "@/lib/games/listing-checks";
import { cn } from "@/lib/utils";

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
  const locales = Object.keys(entries).sort((a, b) =>
    a === sourceLocale ? -1 : b === sourceLocale ? 1 : a.localeCompare(b),
  );
  const hasEntries = locales.length > 0;

  useEffect(() => {
    if (hasEntries && window.location.hash === `#${ANCHOR_ID}`) {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [hasEntries]);

  if (!hasEntries) return null;

  const flagged = new Set(findSameDescriptionGroups(entries).flat());

  return (
    <div ref={sectionRef} id={ANCHOR_ID} className="flex scroll-mt-4 flex-col gap-1.5">
      <label className="text-xs font-semibold text-ink-2">{t("listingTranslations")}</label>
      <p className="text-[11px] text-faint">{t("listingTranslationsHint")}</p>
      <ListingSameTextWarning translations={entries} />
      <div className="mt-1 flex flex-col gap-3">
        {locales.map((locale) => {
          const entry = entries[locale];
          const name = languageDisplayName(locale, uiLocale);
          return (
            <div
              key={locale}
              className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3"
            >
              <span className="text-xs font-semibold text-ink-2">
                {name}
                {locale === sourceLocale && (
                  <span className="ml-1.5 font-normal text-faint">
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
                  "w-full resize-y rounded-md border border-border-strong bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-soft-2",
                  flagged.has(locale) && "border-warning",
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
