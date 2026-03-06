"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { Game } from "@/types/database";

interface GameRemixControlsProps {
  mode: "create" | "remix";
  profileId: string;
  gameId?: string;
  initialInstruction?: string;
  gameState?: Record<string, unknown>;
  onSuccess?: (game: Game) => void;
}

export function GameRemixControls({
  mode,
  profileId,
  gameId,
  initialInstruction = "",
  gameState,
  onSuccess,
}: GameRemixControlsProps) {
  const t = useTranslations("games");
  const router = useRouter();

  const [instruction, setInstruction] = useState(initialInstruction);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!instruction.trim()) {
      setError(t("instructionRequired"));
      return;
    }

    if (mode === "remix" && !gameId) {
      setError("Missing game id");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response =
        mode === "create"
          ? await fetch("/api/games", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                profileId,
                prompt: instruction.trim(),
              }),
            })
          : await fetch(`/api/games/${gameId}/remix`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                profileId,
                instruction: instruction.trim(),
                gameState,
              }),
            });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: t("failedRemix") }));
        throw new Error(data.error || t("failedRemix"));
      }

      const game: Game = await response.json();
      onSuccess?.(game);

      router.push(`/games/${game.id}`);
      router.refresh();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : t("failedRemix");
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
      <label htmlFor="game-instruction" className="text-sm font-medium text-dodi-800">
        {mode === "create" ? t("createPromptLabel") : t("remixPromptLabel")}
      </label>
      <textarea
        id="game-instruction"
        rows={6}
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        placeholder={
          mode === "create" ? t("createPromptPlaceholder") : t("remixPromptPlaceholder")
        }
        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading
            ? t("working")
            : mode === "create"
              ? t("createGameAction")
              : t("remixAction")}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {t("back")}
        </Button>
      </div>
    </form>
  );
}
