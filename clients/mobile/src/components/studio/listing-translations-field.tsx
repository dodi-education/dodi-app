import { View } from "react-native";
import { useLocale, useTranslations } from "use-intl";
import type { ListingText } from "@dodi/client-state/game-publication";
import {
  flaggedListingLocales,
  languageDisplayName,
  sortListingLocales,
} from "@dodi/client-state/listing-checks";
import { listingTranslations as styles, studioSettings, studioTextarea } from "@dodi/ui-recipes";

import { ListingSameTextWarning } from "@/components/games-library/listing-same-text-warning";
import { Input, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

import { StudioTextarea } from "./studio-textarea";

interface ListingTranslationsFieldProps {
  entries: Record<string, ListingText>;
  /** The game's own (the child's) language, marked on its card. */
  sourceLocale: string | null;
  onChange: (locale: string, entry: ListingText) => void;
}

/**
 * The per-language dodi Discover listing texts, made when the game is first
 * published (web: ListingTranslationsField). Where a review's translation
 * findings get fixed; hidden until a translation exists.
 */
export function ListingTranslationsField({ entries, sourceLocale, onChange }: ListingTranslationsFieldProps) {
  const t = useTranslations("gameStudio");
  const uiLocale = useLocale();
  // Game language first, then the rest alphabetically.
  const locales = sortListingLocales(entries, sourceLocale);
  if (locales.length === 0) return null;
  const flagged = flaggedListingLocales(entries);

  return (
    <View className={styles.root}>
      <Text className={studioSettings.label}>{t("listingTranslations")}</Text>
      <Text className={studioSettings.hint}>{t("listingTranslationsHint")}</Text>
      <ListingSameTextWarning translations={entries} />
      <View className={styles.list}>
        {locales.map((locale) => {
          const entry = entries[locale];
          const name = languageDisplayName(locale, uiLocale);
          return (
            <View key={locale} className={styles.card}>
              <Text className={studioSettings.label}>
                {name}
                {locale === sourceLocale ? (
                  <Text className={cn(studioSettings.label, styles.gameLanguage)}>
                    {` ${t("listingTranslationGameLanguage")}`}
                  </Text>
                ) : null}
              </Text>
              <Input
                value={entry.title}
                maxLength={200}
                placeholder={t("listingTranslationTitlePlaceholder")}
                accessibilityLabel={t("publishTranslatedTitle", { locale: name })}
                onChangeText={(title) => onChange(locale, { ...entry, title })}
              />
              <StudioTextarea
                value={entry.description}
                maxLength={5000}
                numberOfLines={3}
                accessibilityLabel={t("publishTranslatedDescription", { locale: name })}
                // rows={3} on the web: about the goal field's height.
                className={cn(studioTextarea.goal, flagged.has(locale) && styles.flagged)}
                onChangeText={(description) => onChange(locale, { ...entry, description })}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}
