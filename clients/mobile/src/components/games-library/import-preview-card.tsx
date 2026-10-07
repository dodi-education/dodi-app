import { Image, View } from "react-native";
import { useTranslations } from "use-intl";
import type { ParsedGameExport } from "@dodi/games/export";
import { importPreview } from "@dodi/ui-recipes";

import { Icon, Text } from "@/components/ui";
import { useTagLabel } from "@/lib/tag-label";

import { tagStyle } from "./tag-style";

/** Non-executing preview of a parsed archive: the game code is never rendered here. */
export function ImportPreviewCard({ parsed }: { parsed: ParsedGameExport }) {
  const t = useTranslations("gameStudio");
  const tagLabel = useTagLabel();
  const { manifest } = parsed;
  // Card thumbnail: the archive's list preview, else its background image.
  const thumb = parsed.previewImageDataUrl ?? parsed.backgroundDataUrl;

  return (
    <View className={importPreview.card}>
      {thumb ? (
        <Image
          source={{ uri: thumb }}
          className={importPreview.thumb}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          // Decorative: the title beside it names the item.
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}
      <View className={importPreview.main}>
        <Text className={importPreview.title} numberOfLines={1}>
          {manifest.title}
        </Text>
        {manifest.description ? (
          <Text className={importPreview.description} numberOfLines={3}>
            {manifest.description}
          </Text>
        ) : null}
        <Text className={importPreview.meta}>
          {t("importAges", { min: manifest.targetAgeMin, max: manifest.targetAgeMax })}
          {" · "}
          {t("importDuration", { minutes: manifest.estimatedDurationMinutes })}
          {parsed.unbuilt ? ` · ${t("importPreviewUnbuilt")}` : ""}
        </Text>
        {parsed.tags.length > 0 ? (
          <View className={importPreview.tags}>
            {parsed.tags.map((tag) => (
              <View key={tag} className={importPreview.tag}>
                <Icon name={tagStyle(tag).icon} size={12} color="ink-2" />
                <Text className={importPreview.tagText}>{tagLabel(tag)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}
