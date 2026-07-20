"use client";

import { notFound, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { GamePlayView } from "@/components/games/game-play-view";
import { dodi } from "@/lib/api";
import { getCookie } from "@/lib/cookies";
import {
  coerceProgressKind,
  coerceSuccessCriteria,
} from "@dodi/games/game-spec";
import type { Game } from "@dodi/types/database";
import type { GameMetadata } from "@dodi/types/games";

export default function GamePlayPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const t = useTranslations("games");

  const [kidId, setKidId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [game, setGame] = useState<Game | null>(null);
  const [missing, setMissing] = useState(false);
  const loggedRef = useRef(false);

  useEffect(() => {
    const pid = getCookie("dodi-active-kid");
    let cancelled = false;

    // Init from the cookie after mount, deferred off the synchronous effect tick
    // (avoids the cascading-render lint and SSR/hydration skew from `document`).
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setKidId(pid);
      setReady(true);
    });

    if (pid) {
      // `kidId` makes the platform derive the locale and enforce visibility
      // (inactive/unshared games 404 even via a direct URL).
      dodi
        .request(`/api/games/${id}?kidId=${pid}`)
        .then((r) => {
          if (!r.ok) {
            if (!cancelled) setMissing(true);
            return null;
          }
          return r.json() as Promise<Game>;
        })
        .then((g) => {
          if (cancelled || !g) return;
          setGame(g);
          // Fire-and-forget memory log; the route derives persona + prefixes title.
          if (!loggedRef.current) {
            loggedRef.current = true;
            void dodi
              .request(`/api/games/${id}/events`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  kidId: pid,
                  event: "game_started",
                  message: "Started game",
                }),
              })
              .catch(() => {});
          }
        })
        .catch(() => {
          if (!cancelled) setMissing(true);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (missing) notFound();

  if (ready && !kidId) {
    return (
      <div className="w-full max-w-xl rounded-2xl border bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-dodi-800">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("kidRequired")}
        </p>
      </div>
    );
  }

  if (!game || !kidId) return null;

  const metadata = game.metadata as unknown as GameMetadata | null;

  return (
    <GamePlayView
      gameId={game.id}
      kidId={kidId}
      title={game.title}
      description={game.description}
      codeBundle={game.code_bundle}
      markdown={game.markdown}
      learningGoal={game.learning_goal}
      successDefinition={game.success_definition}
      successCriteria={coerceSuccessCriteria(game.success_criteria)}
      progressKind={coerceProgressKind(game.progress_kind)}
      capabilities={metadata?.capabilities ?? []}
      drawingStyle={metadata?.drawingStyle ?? "picture"}
    />
  );
}
