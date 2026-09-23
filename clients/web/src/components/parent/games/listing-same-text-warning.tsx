"use client";

import { useLocale, useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import type { ListingText } from "@/lib/ai/client-translate-game";
import { findSameDescriptionGroups, languageDisplayName } from "@/lib/games/listing-checks";

interface ListingSameTextWarningProps {
  translations: Record<string, ListingText>;
}

/**
 * Warns (never blocks) when languages share a word-for-word description, so a
 * likely untranslated listing is caught before the review rejects it.
 */
export function ListingSameTextWarning({ translations }: ListingSameTextWarningProps) {
  const t = useTranslations("gameStudio");
  const uiLocale = useLocale();
  const groups = findSameDescriptionGroups(translations);
  if (groups.length === 0) return null;

  const list = new Intl.ListFormat(uiLocale, { type: "conjunction" });
  return (
    <div role="status" className="flex gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-ink-2">
      <Icon name="alert" size={16} className="shrink-0 text-warning" />
      <div className="flex flex-col gap-1">
        {groups.map((group) => (
          <p key={group.join(",")}>
            {t("listingSameDescription", {
              languages: list.format(group.map((locale) => languageDisplayName(locale, uiLocale))),
            })}
          </p>
        ))}
      </div>
    </div>
  );
}
