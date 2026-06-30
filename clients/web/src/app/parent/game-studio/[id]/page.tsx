"use client";

import { notFound, useParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  GameStudio,
  type StudioGame,
} from "@/components/parent/games/game-studio";
import { dodi } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { coerceProgressKind } from "@dodi/games/game-spec";
import { isUnbuiltBundle } from "@dodi/games/placeholder";
import type { Game } from "@dodi/types/database";

export default function EditGameStudioPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [initialGame, setInitialGame] = useState<StudioGame | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const [{ data: userData }, gameRes, sharingRes] = await Promise.all([
        supabase.auth.getUser(),
        dodi.request(`/api/games/${id}`),
        dodi.request(`/api/games/${id}/sharing`),
      ]);
      if (cancelled) return;

      const user = userData.user;
      if (!gameRes.ok) {
        setMissing(true);
        return;
      }
      const game: Game = await gameRes.json();
      // Only the owning account may edit a game in the studio (excludes system).
      if (!user || game.account_id !== user.id) {
        setMissing(true);
        return;
      }

      const sharing: { family: boolean; kidIds: string[] } = sharingRes.ok
        ? await sharingRes.json()
        : { family: false, kidIds: [] };
      if (cancelled) return;

      const audienceIds = sharing.family
        ? []
        : sharing.kidIds.length > 0
          ? sharing.kidIds
          : game.kid_id
            ? [game.kid_id]
            : [];

      setInitialGame({
        id: game.id,
        title: game.title,
        tags: game.tags,
        description: game.description,
        learningGoal: game.learning_goal,
        successDefinition: game.success_definition,
        progressKind: coerceProgressKind(game.progress_kind),
        codeBundle: game.code_bundle,
        markdown: game.markdown,
        audienceIds,
        isFamily: sharing.family,
        // "Built" once Dodi has replaced the unbuilt placeholder with real code.
        built: !isUnbuiltBundle(game.code_bundle),
        isActive: game.is_active,
      });
    }
    load().catch(() => {
      if (!cancelled) setMissing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (missing) notFound();
  if (!initialGame) return null;

  return <GameStudio initialGame={initialGame} />;
}
