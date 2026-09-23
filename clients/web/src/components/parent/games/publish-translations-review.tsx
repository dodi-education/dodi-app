"use client";

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import type {
  ListingText,
  PublicationTranslationResult,
} from "@/lib/ai/client-translate-game";

interface PublishTranslationsReviewProps {
  review: PublicationTranslationResult;
  disabled: boolean;
  onChange: (locale: string, entry: ListingText) => void;
}

/**
 * The translate-then-review stage: every locale's listing title and
 * description, editable except the parent's own source language.
 */
export function PublishTranslationsReview({
  review,
  disabled,
  onChange,
}: PublishTranslationsReviewProps) {
  const t = useTranslations("gameStudio");

  return (
    <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto">
      <p className="text-xs text-muted-foreground">{t("publishReviewTranslationsHint")}</p>
      {Object.entries(review.translations).map(([locale, entry]) => {
        const isSource = locale === review.sourceLocale;
        return (
          <div key={locale} className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase text-ink-2">
              {locale}
              {isSource && (
                <span className="ml-1.5 normal-case text-faint">
                  {t("publishSourceLanguage")}
                </span>
              )}
            </label>
            <Input
              value={entry.title}
              disabled={isSource || disabled}
              maxLength={200}
              aria-label={t("publishTranslatedTitle", { locale })}
              onChange={(e) => onChange(locale, { ...entry, title: e.target.value })}
            />
            <textarea
              value={entry.description}
              disabled={isSource || disabled}
              maxLength={5000}
              rows={2}
              aria-label={t("publishTranslatedDescription", { locale })}
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50"
              onChange={(e) => onChange(locale, { ...entry, description: e.target.value })}
            />
          </div>
        );
      })}
    </div>
  );
}
