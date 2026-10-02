import { View } from "react-native";
import { useLocale, useTranslations } from "use-intl";
import type { ListingText } from "@dodi/client-state/game-publication";
import { findSameDescriptionGroups, languageDisplayName } from "@dodi/client-state/listing-checks";
import { publishCallout } from "@dodi/ui-recipes";

import { Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

/** "German and French" in the UI language; a plain comma list where the engine lacks ListFormat. */
function formatList(items: string[], uiLocale: string): string {
  try {
    return new Intl.ListFormat(uiLocale, { type: "conjunction" }).format(items);
  } catch {
    return items.join(", ");
  }
}

/**
 * Warns (never blocks) when languages share a word-for-word description, so a
 * likely untranslated listing is caught before review rejects it (web:
 * listing-same-text-warning).
 */
export function ListingSameTextWarning({ translations }: { translations: Record<string, ListingText> }) {
  const t = useTranslations("gameStudio");
  const uiLocale = useLocale();
  const groups = findSameDescriptionGroups(translations);
  if (groups.length === 0) return null;

  return (
    <View accessibilityRole="alert" className={cn(publishCallout.compact, publishCallout.warning)}>
      <Icon name="alert" size={16} color="warning" />
      <View className={cn(publishCallout.bodyTight, "flex-1")}>
        {groups.map((group) => (
          <Text key={group.join(",")} className={cn(publishCallout.text, publishCallout.bodyText)}>
            {t("listingSameDescription", {
              languages: formatList(
                group.map((locale) => languageDisplayName(locale, uiLocale)),
                uiLocale,
              ),
            })}
          </Text>
        ))}
      </View>
    </View>
  );
}
