"use client";

import { useTranslations } from "next-intl";

import type {
  ListingText,
  PublicationTranslationResult,
} from "@dodi/client-state/game-publication";
import { flaggedListingLocales } from "@dodi/client-state/listing-checks";
import { dialogField, translationsReview } from "@dodi/ui-recipes";

import { Input } from "@/components/ui/input";
import { ListingSameTextWarning } from "@/components/parent/games/listing-same-text-warning";
import { cn } from "@/lib/utils";

interface PublishTranslationsReviewProps {
  review: PublicationTranslationResult;
  disabled: boolean;
  onChange: (locale: string, entry: ListingText) => void;
}

/**
 * The translate-then-review stage: every locale's listing title and
 * description, all editable (the game-language listing starts as the game's
 * own name and description, which may be in the parent's language instead).
 */
export function PublishTranslationsReview({
  review,
  disabled,
  onChange,
}: PublishTranslationsReviewProps) {
  const t = useTranslations("gameStudio");
  const flagged = flaggedListingLocales(review.translations);

  return (
    <div className={cn(translationsReview.webRoot, translationsReview.root)}>
      <p className={dialogField.note}>{t("publishReviewTranslationsHint")}</p>
      <ListingSameTextWarning translations={review.translations} />
      {Object.entries(review.translations).map(([locale, entry]) => {
        const isSource = locale === review.sourceLocale;
        return (
          <div key={locale} className={cn(translationsReview.webField, translationsReview.field)}>
            <label className={translationsReview.locale}>
              {locale}
              {isSource && (
                <span className={translationsReview.sourceTag}>
                  {t("listingTranslationGameLanguage")}
                </span>
              )}
            </label>
            <Input
              value={entry.title}
              disabled={disabled}
              maxLength={200}
              aria-label={t("publishTranslatedTitle", { locale })}
              onChange={(e) => onChange(locale, { ...entry, title: e.target.value })}
            />
            <textarea
              value={entry.description}
              disabled={disabled}
              maxLength={5000}
              rows={2}
              aria-label={t("publishTranslatedDescription", { locale })}
              className={cn(
                translationsReview.textarea,
                translationsReview.textareaText,
                translationsReview.webTextarea,
                flagged.has(locale) && translationsReview.flagged,
              )}
              onChange={(e) => onChange(locale, { ...entry, description: e.target.value })}
            />
          </div>
        );
      })}
    </div>
  );
}
