import { TextInput, View } from "react-native";
import { useTranslations } from "use-intl";
import type { ListingText, PublicationTranslationResult } from "@dodi/client-state/game-publication";
import { flaggedListingLocales } from "@dodi/client-state/listing-checks";
import { dialogField, input, translationsReview } from "@dodi/ui-recipes";

import { Input, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fontFamilyFor } from "@/lib/fonts";

import { ListingSameTextWarning } from "./listing-same-text-warning";

/**
 * The translate-then-review stage: every locale's listing title and
 * description, all editable (web: publish-translations-review). The dialog
 * scrolls it.
 */
export function PublishTranslationsReview({
  review,
  disabled,
  onChange,
}: {
  review: PublicationTranslationResult;
  disabled: boolean;
  onChange: (locale: string, entry: ListingText) => void;
}) {
  const t = useTranslations("gameStudio");
  const flagged = flaggedListingLocales(review.translations);
  const areaClass = cn(
    translationsReview.textarea,
    translationsReview.textareaText,
    translationsReview.textareaHeight,
    "text-foreground",
  );

  return (
    <View className={translationsReview.root}>
      <Text className={dialogField.note}>{t("publishReviewTranslationsHint")}</Text>
      <ListingSameTextWarning translations={review.translations} />
      {Object.entries(review.translations).map(([locale, entry]) => {
        const isSource = locale === review.sourceLocale;
        return (
          <View key={locale} className={translationsReview.field}>
            <Text className={translationsReview.locale}>
              {locale}
              {isSource ? (
                <Text className={translationsReview.sourceTag}> {t("listingTranslationGameLanguage")}</Text>
              ) : null}
            </Text>
            <Input
              value={entry.title}
              editable={!disabled}
              maxLength={200}
              accessibilityLabel={t("publishTranslatedTitle", { locale })}
              onChangeText={(title) => onChange(locale, { ...entry, title })}
            />
            <TextInput
              value={entry.description}
              editable={!disabled}
              maxLength={5000}
              multiline
              textAlignVertical="top"
              placeholderTextColor={input.placeholderColor}
              accessibilityLabel={t("publishTranslatedDescription", { locale })}
              className={cn(areaClass, flagged.has(locale) && translationsReview.flagged, disabled && "opacity-50")}
              style={{ fontFamily: fontFamilyFor(areaClass) }}
              onChangeText={(description) => onChange(locale, { ...entry, description })}
            />
          </View>
        );
      })}
    </View>
  );
}
