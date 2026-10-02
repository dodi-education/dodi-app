"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { KidButton } from "@/components/kid/kid-button";
import { GameCard } from "@/components/games/game-card";
import { tagStyle } from "@/components/parent/games/tag-style";
import { useTagLabel } from "@/lib/games/tag-label";
import { cn } from "@/lib/utils";
import { useKidGames } from "@/hooks/use-games";
import { dodi } from "@/lib/api";
import { clientState } from "@/lib/client-state";
import {
  ALL_TAGS_FILTER,
  filterKidGames,
  kidGameTagOptions,
  splitFavoriteGames,
  toggleFavoriteGame,
} from "@dodi/client-state/kid-game-library";
import { gameFilters, kidLibrary, kidLibraryState } from "@dodi/ui-recipes";

interface GameLibraryProps {
  kidId: string;
}

export function GameLibrary({ kidId }: GameLibraryProps) {
  const t = useTranslations("games");
  const tagLabel = useTagLabel();
  const searchParams = useSearchParams();

  // Titles and descriptions are E2EE; the store hands them over decrypted, which
  // is also what makes the free-text search below possible at all — the server
  // cannot search ciphertext.
  const { games: loaded, loading, error } = useKidGames(kidId);
  const games = useMemo(() => loaded ?? [], [loaded]);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [tagFilter, setTagFilter] = useState<string>(
    searchParams.get("tag") ?? ALL_TAGS_FILTER,
  );

  // Toggle a favorite with an optimistic flip; reverts if the request fails.
  const toggleFavorite = useCallback(
    (gameId: string, next: boolean) =>
      toggleFavoriteGame({ api: dodi, games: clientState.games }, kidId, gameId, next),
    [kidId],
  );

  // Only catalog tags that are actually in use become filter pills.
  const tagOptions = useMemo(() => kidGameTagOptions(games), [games]);

  const filteredGames = useMemo(
    () => filterKidGames(games, search, tagFilter),
    [games, search, tagFilter],
  );

  const { favorites: favoriteGames, others: otherGames } =
    splitFavoriteGames(filteredGames);

  return (
    <div className={kidLibrary.root}>
      <div className={cn(kidLibrary.webHead, kidLibrary.head)}>
        <div>
          <h1 className={kidLibrary.title}>
            {t("title")}
          </h1>
          <p className={kidLibrary.subtitle}>
            {t("subtitle")}
          </p>
        </div>
      </div>

      <div className={cn(gameFilters.webRow, gameFilters.row)}>
        <label
          className={cn(gameFilters.webSearch, gameFilters.search, gameFilters.searchText)}
        >
          <Icon name="search" size={16} stroke={2.2} />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className={cn(gameFilters.input, gameFilters.webInput)}
          />
        </label>
        <KidButton
          variant="chip"
          size="sm"
          active={tagFilter === ALL_TAGS_FILTER}
          onClick={() => setTagFilter(ALL_TAGS_FILTER)}
        >
          {t("allGamesFilter")}
        </KidButton>
        {tagOptions.map((tag) => {
          const ts = tagStyle(tag);
          const label = tagLabel(tag);
          const active = tagFilter === tag;
          return (
            <KidButton
              key={tag}
              variant="chip"
              size="sm"
              active={active}
              aria-pressed={active}
              onClick={() => setTagFilter(tag)}
              aria-label={label}
              title={label}
              className={gameFilters.tagChip}
              style={
                active
                  ? { background: ts.fg, color: "#fff" }
                  : { background: ts.bg, color: ts.fg }
              }
            >
              <Icon name={ts.icon} size={20} stroke={2} className={gameFilters.tagIcon} />
            </KidButton>
          );
        })}
      </div>

      {loading && (
        <div
          className={cn(
            kidLibraryState.loading,
            kidLibraryState.loadingText,
            kidLibraryState.webLoading,
          )}
        >
          {t("loading")}
        </div>
      )}

      {!loading && error && (
        <div className={cn(kidLibraryState.error, kidLibraryState.errorText)}>
          {error}
        </div>
      )}

      {!loading && !error && filteredGames.length === 0 && (
        <div className={cn(kidLibraryState.empty, kidLibraryState.emptyText)}>
          {t("noGames")}
        </div>
      )}

      {!loading && !error && filteredGames.length > 0 && (
        <>
          {favoriteGames.length > 0 && (
            <section>
              <h2 className={cn(kidLibrary.section, kidLibrary.sectionFirst)}>
                {t("favoriteGames")}
              </h2>
              <div className={cn(kidLibrary.webGrid, kidLibrary.grid)}>
                {favoriteGames.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    isFavorite
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </div>
            </section>
          )}

          {otherGames.length > 0 && (
            <section>
              <h2 className={cn(kidLibrary.section, kidLibrary.sectionNext)}>
                {t("allGames")}
              </h2>
              <div className={cn(kidLibrary.webGrid, kidLibrary.grid)}>
                {otherGames.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    isFavorite={false}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
