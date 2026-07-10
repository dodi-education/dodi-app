"use client";

import { dodi } from "@/lib/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { KidButton } from "@/components/kid/kid-button";
import { GameCard } from "@/components/games/game-card";
import { tagStyle } from "@/components/parent/games/tag-style";
import { useTagLabel } from "@/lib/games/tag-label";
import { GAME_TAG_IDS } from "@dodi/games/tags";
import type { Game } from "@dodi/types/database";

/** A game as delivered to the kid library — carries the per-kid favorite flag. */
type LibraryGame = Game & { is_favorite: boolean };

interface GameLibraryProps {
  kidId: string;
}

export function GameLibrary({ kidId }: GameLibraryProps) {
  const t = useTranslations("games");
  const tagLabel = useTagLabel();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<LibraryGame[]>([]);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [tagFilter, setTagFilter] = useState<string>(searchParams.get("tag") ?? "all");

  const fetchGames = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await dodi.request(`/api/games?kidId=${kidId}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Failed to fetch games" }));
        throw new Error(data.error || "Failed to fetch games");
      }

      const data: LibraryGame[] = await response.json();
      setGames(data);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "Failed to fetch games";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [kidId]);

  useEffect(() => {
    void fetchGames();
  }, [fetchGames]);

  // Toggle a favorite with an optimistic flip; revert if the request fails.
  const toggleFavorite = useCallback(
    async (gameId: string, next: boolean) => {
      setGames((prev) =>
        prev.map((game) =>
          game.id === gameId ? { ...game, is_favorite: next } : game,
        ),
      );
      try {
        const response = await dodi.request(
          `/api/games/${gameId}/favorite?kidId=${kidId}`,
          { method: next ? "PUT" : "DELETE" },
        );
        if (!response.ok) throw new Error("Failed to update favorite");
      } catch {
        setGames((prev) =>
          prev.map((game) =>
            game.id === gameId ? { ...game, is_favorite: !next } : game,
          ),
        );
      }
    },
    [kidId],
  );

  // Only catalog tags that are actually in use become filter pills.
  const tagOptions = useMemo(
    () => GAME_TAG_IDS.filter((tag) => games.some((game) => game.tags.includes(tag))),
    [games],
  );

  const filteredGames = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return games.filter((game) => {
      if (tagFilter !== "all" && !game.tags.includes(tagFilter)) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const target = `${game.title} ${game.description} ${game.tags.join(" ")}`.toLowerCase();
      return target.includes(normalizedSearch);
    });
  }, [games, search, tagFilter]);

  const favoriteGames = filteredGames.filter((game) => game.is_favorite);
  const otherGames = filteredGames.filter((game) => !game.is_favorite);

  return (
    <div className="w-full max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[27px] font-extrabold tracking-tight text-ink">
            {t("title")}
          </h1>
          <p className="mt-0.5 text-sm font-semibold text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
      </div>

      <div className="mt-4 mb-6 flex flex-wrap items-center gap-2">
        <label className="flex w-[280px] items-center gap-2 rounded-full bg-white px-4 py-2 text-faint shadow-[inset_0_0_0_1.5px_var(--border)] focus-within:shadow-[inset_0_0_0_2px_var(--color-primary-soft-2)]">
          <Icon name="search" size={16} stroke={2.2} />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className="min-w-0 flex-1 border-0 bg-transparent text-sm font-bold text-ink outline-none placeholder:font-semibold placeholder:text-faint"
          />
        </label>
        <KidButton
          variant="chip"
          size="sm"
          active={tagFilter === "all"}
          onClick={() => setTagFilter("all")}
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
              className="px-2"
              style={
                active
                  ? { background: ts.fg, color: "#fff" }
                  : { background: ts.bg, color: ts.fg }
              }
            >
              <Icon name={ts.icon} size={20} stroke={2} className="size-5" />
            </KidButton>
          );
        })}
      </div>

      {loading && (
        <div className="rounded-[20px] bg-white p-6 text-sm font-semibold text-muted-foreground shadow-[0_2px_10px_rgba(34,56,78,0.05)]">
          {t("loading")}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-[20px] bg-danger-soft p-6 text-sm font-semibold text-danger">
          {error}
        </div>
      )}

      {!loading && !error && filteredGames.length === 0 && (
        <div className="rounded-[20px] bg-white/70 p-5 text-sm font-semibold text-muted-foreground">
          {t("noGames")}
        </div>
      )}

      {!loading && !error && filteredGames.length > 0 && (
        <>
          {favoriteGames.length > 0 && (
            <section>
              <h2 className="mb-3 mt-5 text-[13px] font-extrabold tracking-[0.07em] text-faint uppercase">
                {t("favoriteGames")}
              </h2>
              <div className="grid gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(310px,1fr))]">
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
              <h2 className="mb-3 mt-6 text-[13px] font-extrabold tracking-[0.07em] text-faint uppercase">
                {t("allGames")}
              </h2>
              <div className="grid gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(310px,1fr))]">
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
