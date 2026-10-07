import { useCallback, useEffect, useMemo, useState } from "react";
import { TextInput, View } from "react-native";
import { useTranslations } from "use-intl";
import {
  ALL_TAGS_FILTER,
  filterKidGames,
  kidGameTagOptions,
  splitFavoriteGames,
  toggleFavoriteGame,
} from "@dodi/client-state/kid-game-library";
import type { LibraryGame } from "@dodi/client-state/game-store";
import { gameFilters, input as inputRecipe, kidLibrary, kidLibraryState } from "@dodi/ui-recipes";

import { api } from "@/adapters/platform";
import { tagStyle } from "@/components/games-library/tag-style";
import { KidButton } from "@/components/kid/kid-button";
import { kidShadowStyle } from "@/components/kid/kid-shadow";
import { KidText } from "@/components/kid/kid-text";
import { Icon } from "@/components/ui";
import { clientState } from "@/lib/client-state";
import { cn } from "@/lib/cn";
import { fontFamilyFor } from "@/lib/fonts";
import { onKidTabReselect } from "@/lib/kid-tab-reselect";
import { useRefreshOnPull } from "@/lib/refresh-scope";
import { useKidGames } from "@/lib/use-kid-games";
import { useTagLabel } from "@/lib/tag-label";

import { GameCard } from "./game-card";

const SEARCH_CLASSES = cn(gameFilters.input, "font-kid");

/**
 * The kid's games (web: components/games/game-library), as the web renders it
 * on a phone: title, search + tag pills, then Favorites and All games. The web
 * seeds search/tag from the URL query; the app starts unfiltered and re-tapping
 * the Games tab clears the filters.
 */
export function GameLibrary({ kidId }: { kidId: string }) {
  const t = useTranslations("games");
  const tagLabel = useTagLabel();
  // Titles and descriptions are E2EE; the store hands them over decrypted,
  // which is what makes the free-text search possible at all.
  const { games: loaded, loading, error } = useKidGames(kidId);
  const games = useMemo<LibraryGame[]>(() => loaded ?? [], [loaded]);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string>(ALL_TAGS_FILTER);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Pull to refresh (kid chrome): the library past the cache. Filters stay.
  useRefreshOnPull("kid-games", () => clientState.games.getState().loadForKid(kidId, true));

  useEffect(
    () =>
      onKidTabReselect((href) => {
        if (href !== "/games") return;
        setSearch("");
        setTagFilter(ALL_TAGS_FILTER);
      }),
    [],
  );

  // Optimistic flip; reverts if the request fails.
  const toggleFavorite = useCallback(
    (gameId: string, next: boolean) => {
      void toggleFavoriteGame({ api, games: clientState.games }, kidId, gameId, next);
    },
    [kidId],
  );

  const tagOptions = useMemo(() => kidGameTagOptions(games), [games]);
  const filteredGames = useMemo(() => filterKidGames(games, search, tagFilter), [games, search, tagFilter]);
  const { favorites, others } = splitFavoriteGames(filteredGames);

  return (
    <View className={kidLibrary.root}>
      <View className={kidLibrary.head}>
        <View>
          <KidText className={kidLibrary.title} accessibilityRole="header">
            {t("title")}
          </KidText>
          <KidText className={kidLibrary.subtitle}>{t("subtitle")}</KidText>
        </View>
      </View>

      <View className={gameFilters.row}>
        <View
          className={cn(
            gameFilters.search,
            gameFilters.searchBorder,
            isSearchFocused && gameFilters.searchFocused,
          )}
        >
          <Icon name="search" size={16} stroke={2.2} color="faint" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t("searchPlaceholder")}
            placeholderTextColor={inputRecipe.placeholderColor}
            accessibilityLabel={t("searchPlaceholder")}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            autoCorrect={false}
            returnKeyType="search"
            className={SEARCH_CLASSES}
            style={{ fontFamily: fontFamilyFor(SEARCH_CLASSES), paddingVertical: 0 }}
          />
        </View>
        <KidButton
          variant="chip"
          size="sm"
          active={tagFilter === ALL_TAGS_FILTER}
          onPress={() => setTagFilter(ALL_TAGS_FILTER)}
        >
          {t("allGamesFilter")}
        </KidButton>
        {tagOptions.map((tag) => {
          const ts = tagStyle(tag);
          const isActive = tagFilter === tag;
          return (
            <KidButton
              key={tag}
              variant="chip"
              size="sm"
              active={isActive}
              accessibilityLabel={tagLabel(tag)}
              onPress={() => setTagFilter(tag)}
              className={gameFilters.tagChip}
              // The tag's own colors win over the chip's (web: inline style).
              style={{ backgroundColor: isActive ? ts.fg : ts.bg }}
            >
              <Icon name={ts.icon} size={20} stroke={2} color="primary-foreground" tint={isActive ? undefined : ts.fg} />
            </KidButton>
          );
        })}
      </View>

      {loading ? (
        <View className={kidLibraryState.loading} style={kidShadowStyle("row")} accessibilityState={{ busy: true }}>
          <KidText className={kidLibraryState.loadingText}>{t("loading")}</KidText>
        </View>
      ) : error ? (
        <View className={kidLibraryState.error} accessibilityRole="alert">
          <KidText className={kidLibraryState.errorText}>{error}</KidText>
        </View>
      ) : filteredGames.length === 0 ? (
        <View className={kidLibraryState.empty}>
          <KidText className={kidLibraryState.emptyText}>{t("noGames")}</KidText>
        </View>
      ) : (
        <>
          {favorites.length > 0 ? (
            <View>
              <KidText className={cn(kidLibrary.section, kidLibrary.sectionFirst)} accessibilityRole="header">
                {t("favoriteGames")}
              </KidText>
              <View className={kidLibrary.grid}>
                {favorites.map((game) => (
                  <GameCard key={game.id} game={game} isFavorite onToggleFavorite={toggleFavorite} />
                ))}
              </View>
            </View>
          ) : null}
          {others.length > 0 ? (
            <View>
              <KidText className={cn(kidLibrary.section, kidLibrary.sectionNext)} accessibilityRole="header">
                {t("allGames")}
              </KidText>
              <View className={kidLibrary.grid}>
                {others.map((game) => (
                  <GameCard key={game.id} game={game} isFavorite={false} onToggleFavorite={toggleFavorite} />
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
