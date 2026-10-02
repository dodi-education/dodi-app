import { type Href, Link } from "expo-router";
import { Image, Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { previewImageSource } from "@dodi/client-state/game-preview-image";
import { kidCardTags } from "@dodi/client-state/kid-game-library";
import type { Game } from "@dodi/types/database";
import { kidCard, kidCardIcons } from "@dodi/ui-recipes";

import { tagStyle } from "@/components/games-library/tag-style";
import { KidButton } from "@/components/kid/kid-button";
import { kidShadowStyle } from "@/components/kid/kid-shadow";
import { KidText } from "@/components/kid/kid-text";
import { Icon } from "@/components/ui";
import { useConnectivityStore } from "@/lib/client-state";
import { cn } from "@/lib/cn";
import { APP_URL } from "@/lib/env";
import { useTagLabel } from "@/lib/tag-label";

/** One game in the kid's library (web: components/games/game-card). */
export function GameCard({
  game,
  isFavorite,
  onToggleFavorite,
}: {
  game: Game;
  isFavorite: boolean;
  onToggleFavorite: (gameId: string, next: boolean) => void;
}) {
  const t = useTranslations("games");
  const tagLabel = useTagLabel();
  // Favorites are a server round-trip: offline the optimistic flip would just revert.
  const isOnline = useConnectivityStore((s) => s.isOnline);
  // The fallback tile is styled from the game's primary tag; only catalog
  // tags are shown as chips.
  const style = tagStyle(game.tags[0] ?? "");
  const tags = kidCardTags(game.tags);
  const href = `/games/${game.id}` as Href;
  // Family games carry a data: URL; system games a path on the web app.
  const preview = previewImageSource(game.preview_image, APP_URL);

  return (
    <View className={kidCard.box} style={kidShadowStyle("row")}>
      <Link href={href} asChild>
        <Pressable accessibilityRole="link" accessibilityLabel={game.title} className={kidCard.link}>
          {preview ? (
            <Image
              source={{ uri: preview }}
              className={kidCard.thumb}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View className={kidCard.tile} style={{ backgroundColor: style.bg }}>
              <Icon name={style.icon} size={kidCardIcons.tile.size} stroke={kidCardIcons.tile.stroke} tint={style.fg} />
            </View>
          )}
          <View className={kidCard.main}>
            <KidText className={kidCard.title}>{game.title}</KidText>
            <View className={kidCard.metaRow}>
              <KidText className={kidCard.meta}>{game.is_system ? t("systemLabel") : t("customLabel")}</KidText>
              {tags.length > 0 ? (
                <View className={kidCard.tags}>
                  {tags.map((tag) => {
                    const ts = tagStyle(tag);
                    return (
                      <View
                        key={tag}
                        accessibilityRole="image"
                        accessibilityLabel={tagLabel(tag)}
                        className={kidCard.tag}
                        style={{ backgroundColor: ts.bg }}
                      >
                        <Icon name={ts.icon} size={kidCardIcons.tag.size} stroke={kidCardIcons.tag.stroke} tint={ts.fg} />
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
            <KidText className={kidCard.description} numberOfLines={2}>
              {game.description}
            </KidText>
          </View>
        </Pressable>
      </Link>

      <View className={kidCard.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isFavorite ? t("removeFavorite") : t("addFavorite")}
          accessibilityState={{ selected: isFavorite, disabled: !isOnline }}
          disabled={!isOnline}
          onPress={() => onToggleFavorite(game.id, !isFavorite)}
          className={cn(kidCard.iconButton, "active:bg-danger-soft")}
        >
          <Icon
            name={isFavorite ? "heart_filled" : "heart"}
            size={kidCardIcons.heart.size}
            stroke={kidCardIcons.heart.stroke}
            color="danger"
          />
        </Pressable>
        <Link href={href} asChild>
          <KidButton size="sm" icon="play" iconSize={kidCardIcons.play.size} className={kidCard.play}>
            {t("playAction")}
          </KidButton>
        </Link>
      </View>
    </View>
  );
}
