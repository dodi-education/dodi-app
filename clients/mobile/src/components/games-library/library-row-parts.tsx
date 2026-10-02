import { Image, Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { previewImageSource } from "@dodi/client-state/game-preview-image";
import { libraryRow } from "@dodi/ui-recipes";

import { Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { APP_URL } from "@/lib/env";
import { useTagLabel } from "@/lib/tag-label";

import { tagStyle } from "./tag-style";

/** The game's preview image, else its primary tag's colored tile. */
export function GameThumb({ previewImage, tags }: { previewImage: string | null; tags: string[] }) {
  // System games' path previews live on the web app.
  const preview = previewImageSource(previewImage, APP_URL);
  if (preview) {
    return (
      <Image
        source={{ uri: preview }}
        className={libraryRow.thumb}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
    );
  }
  const s = tagStyle(tags[0] ?? "");
  return (
    <View className={libraryRow.thumbFallback} style={{ backgroundColor: s.bg }}>
      <Icon name={s.icon} size={28} tint={s.fg} />
    </View>
  );
}

/** Plays, copies and every tag as a small tile (third line of a row). */
export function GameStats({ plays, copies, tags }: { plays: number; copies: number; tags: string[] }) {
  const t = useTranslations("gameStudio");
  const tagLabel = useTagLabel();
  return (
    <View className={libraryRow.stats}>
      <View className={libraryRow.stat} accessible accessibilityLabel={t("discoverPlaysLabel", { count: plays })}>
        <Icon name="games" size={13} color="muted-foreground" />
        <Text className={libraryRow.statsText}>{plays}</Text>
      </View>
      <View className={libraryRow.stat} accessible accessibilityLabel={t("discoverCopiesLabel", { count: copies })}>
        <Icon name="copy" size={13} color="muted-foreground" />
        <Text className={libraryRow.statsText}>{copies}</Text>
      </View>
      {tags.map((raw) => {
        const tag = raw.trim().toLowerCase();
        if (!tag) return null;
        const ts = tagStyle(tag);
        return (
          <View
            key={tag}
            accessible
            accessibilityRole="image"
            accessibilityLabel={tagLabel(tag)}
            className={libraryRow.tagTile}
            style={{ backgroundColor: ts.bg }}
          >
            <Icon name={ts.icon} size={13} stroke={2} tint={ts.fg} />
          </View>
        );
      })}
    </View>
  );
}

/** The 36pt "…" button that opens a row's actions. */
export function RowMenuButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={onPress}
      className={cn(libraryRow.menuButton, "active:bg-card")}
    >
      <Icon name="dots" size={18} color="ink-2" />
    </Pressable>
  );
}
