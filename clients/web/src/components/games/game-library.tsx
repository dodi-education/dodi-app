"use client";

import { dodi } from "@/lib/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { KidButton } from "@/components/kid/kid-button";
import { GameCard } from "@/components/games/game-card";
import type { Game } from "@dodi/types/database";

interface GameLibraryProps {
  profileId: string;
}

export function GameLibrary({ profileId }: GameLibraryProps) {
  const t = useTranslations("games");
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [tagFilter, setTagFilter] = useState<string>(searchParams.get("tag") ?? "all");

  const fetchGames = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await dodi.request(`/api/games?profileId=${profileId}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Failed to fetch games" }));
        throw new Error(data.error || "Failed to fetch games");
      }

      const data: Game[] = await response.json();
      setGames(data);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "Failed to fetch games";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void fetchGames();
  }, [fetchGames]);

  const tagOptions = useMemo(() => {
    const values = new Set<string>();
    for (const game of games) {
      for (const tag of game.tags) values.add(tag);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [games]);

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

  const systemGames = filteredGames.filter((game) => game.is_system);
  const customGames = filteredGames.filter((game) => !game.is_system);

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
          {t("allTags")}
        </KidButton>
        {tagOptions.map((tag) => (
          <KidButton
            key={tag}
            variant="chip"
            size="sm"
            active={tagFilter === tag}
            onClick={() => setTagFilter(tag)}
          >
            {tag}
          </KidButton>
        ))}
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

      {!loading && !error && (
        <>
          <section>
            <h2 className="mb-3 mt-5 text-[13px] font-extrabold tracking-[0.07em] text-faint uppercase">
              {t("customGames")}
            </h2>
            {customGames.length === 0 ? (
              <div className="rounded-[20px] bg-white/70 p-5 text-sm font-semibold text-muted-foreground">
                {t("noCustomGames")}
              </div>
            ) : (
              <div className="grid gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(310px,1fr))]">
                {customGames.map((game) => (
                  <GameCard key={game.id} game={game} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 mt-6 text-[13px] font-extrabold tracking-[0.07em] text-faint uppercase">
              {t("systemGames")}
            </h2>
            {systemGames.length === 0 ? (
              <div className="rounded-[20px] bg-white/70 p-5 text-sm font-semibold text-muted-foreground">
                {t("noSystemGames")}
              </div>
            ) : (
              <div className="grid gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(310px,1fr))]">
                {systemGames.map((game) => (
                  <GameCard key={game.id} game={game} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
