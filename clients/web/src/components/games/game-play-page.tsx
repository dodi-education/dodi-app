"use client";

import { notFound, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { GamePlayView } from "@/components/games/game-play-view";
import { Icon } from "@/components/shared/icon";
import { getCookie } from "@/lib/cookies";
import { logGameEvent } from "@/lib/games/play-sync";
import { isCurrentlyOnline } from "@/stores/connectivity-store";
import { useGameStore } from "@/stores/game-store";
import {
  coerceProgressKind,
  coerceSuccessCriteria,
} from "@dodi/games/game-spec";
import type { Game } from "@dodi/types/database";
import type { GameMetadata } from "@dodi/types/games";

/**
 * The signed-in /games/[id] experience. Extracted from the route file so the
 * server page can branch: authed → this client shell (unchanged), anonymous →
 * the server-rendered public game page.
 */
export function GamePlayPage() {
  const params = useParams<{ id: string }>();
  const t = useTranslations("games");

  const [kidId, setKidId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [game, setGame] = useState<Game | null>(null);
  const [missing, setMissing] = useState(false);
  const [offlineUnavailable, setOfflineUnavailable] = useState(false);
  const loggedRef = useRef(false);

  // The service worker serves ONE cached detail shell for every /games/<id>
  // URL offline, so the hydrated route params may belong to a different id —
  // the URL is the truth. This page must keep rendering nothing until the
  // effect resolves; that's what makes the shell substitution invisible
  // (see public/sw.js detail-shell caching).
  const id =
    (typeof window !== "undefined"
      ? /^\/games\/([^/]+)\/?$/.exec(window.location.pathname)?.[1]
      : undefined) ?? params.id;

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
      // (inactive/unshared games 404 even via a direct URL). The store decrypts
      // the row — everything below this point is plaintext.
      useGameStore
        .getState()
        .loadOne(id, pid)
        .then((g) => {
          if (cancelled) return;
          if (!g) {
            if (!isCurrentlyOnline()) setOfflineUnavailable(true);
            else setMissing(true);
            return;
          }
          setGame(g);
          // Activity log via the offline-capable outbox; the route derives the
          // persona and references the game by id (its title is E2EE).
          if (!loggedRef.current) {
            loggedRef.current = true;
            logGameEvent({
              gameId: id,
              kidId: pid,
              event: "game_started",
              message: "Started game",
            });
          }
        })
        .catch(() => {
          if (cancelled) return;
          // Offline with no cached copy is not a 404 — the game exists, it
          // just isn't saved for offline.
          if (!isCurrentlyOnline()) setOfflineUnavailable(true);
          else setMissing(true);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (missing) notFound();

  if (offlineUnavailable) {
    return (
      <div className="w-full max-w-xl rounded-2xl border bg-white p-6 text-center shadow-sm">
        <Icon
          name="wifi_off"
          size={28}
          className="mx-auto text-muted-foreground"
        />
        <p className="mt-3 text-sm font-semibold text-muted-foreground">
          {t("offlineNotAvailable")}
        </p>
      </div>
    );
  }

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
