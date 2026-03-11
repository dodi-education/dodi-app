"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GameCard } from "@/components/games/game-card";
import type { Game } from "@/types/database";

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
  const [subjectFilter, setSubjectFilter] = useState<string>(searchParams.get("subject") ?? "all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchGames = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/games?profileId=${profileId}`);
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

  const subjectOptions = useMemo(() => {
    const values = new Set<string>();
    for (const game of games) {
      values.add(game.subject);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [games]);

  const filteredGames = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return games.filter((game) => {
      if (subjectFilter !== "all" && game.subject !== subjectFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const target = `${game.title} ${game.description} ${game.tags.join(" ")}`.toLowerCase();
      return target.includes(normalizedSearch);
    });
  }, [games, search, subjectFilter]);

  const systemGames = filteredGames.filter((game) => game.is_system);
  const customGames = filteredGames.filter((game) => !game.is_system);

  async function handleDelete(game: Game) {
    if (!confirm(t("confirmDelete", { title: game.title }))) return;

    setDeletingId(game.id);
    try {
      const response = await fetch(`/api/games/${game.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: t("failedDelete") }));
        throw new Error(data.error || t("failedDelete"));
      }

      setGames((prev) => prev.filter((entry) => entry.id !== game.id));
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : t("failedDelete");
      alert(message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="w-full max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-dodi-800">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/games/new">{t("newGame")}</Link>
        </Button>
      </div>

      <div className="grid gap-3 rounded-2xl border bg-white p-4 shadow-sm md:grid-cols-[1fr_220px]">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("searchPlaceholder")}
        />
        <Select value={subjectFilter} onValueChange={setSubjectFilter}>
          <SelectTrigger>
            <SelectValue placeholder={t("filterSubject")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allSubjects")}</SelectItem>
            {subjectOptions.map((subject) => (
              <SelectItem key={subject} value={subject}>
                {subject}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && (
        <div className="rounded-2xl border bg-white p-6 text-sm text-muted-foreground">
          {t("loading")}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-dodi-700">{t("systemGames")}</h2>
            {systemGames.length === 0 ? (
              <div className="rounded-2xl border bg-white p-5 text-sm text-muted-foreground">
                {t("noSystemGames")}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {systemGames.map((game) => (
                  <GameCard key={game.id} game={game} />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-dodi-700">{t("customGames")}</h2>
            {customGames.length === 0 ? (
              <div className="rounded-2xl border bg-white p-5 text-sm text-muted-foreground">
                {t("noCustomGames")}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {customGames.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    onDelete={handleDelete}
                    isDeleting={deletingId === game.id}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
