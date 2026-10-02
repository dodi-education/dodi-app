"use client";

import { useLocale, useTranslations } from "next-intl";

import type { ListingText } from "@dodi/client-state/game-publication";
import { findSameDescriptionGroups, languageDisplayName } from "@dodi/client-state/listing-checks";
import { publishCallout } from "@dodi/ui-recipes";

import { Icon } from "@/components/shared/icon";
import { cn } from "@/lib/utils";

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
    <div
      role="status"
      className={cn(
        publishCallout.web,
        publishCallout.compact,
        publishCallout.warning,
        publishCallout.text,
        publishCallout.bodyText,
      )}
    >
      <Icon name="alert" size={16} className="shrink-0 text-warning" />
      <div className={cn(publishCallout.webBody, publishCallout.bodyTight)}>
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
