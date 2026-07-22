"use client";

import { notFound, useParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  GameStudio,
  type StudioGame,
  type StudioView,
  isStudioView,
} from "@/components/parent/games/game-studio";
import { dodi } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { useGameStore } from "@/stores/game-store";
import { coerceProgressKind } from "@dodi/games/game-spec";
import { isUnbuiltBundle } from "@dodi/games/placeholder";
import type { GameMetadata } from "@dodi/types/games";

/**
 * The studio at `/parent/game-studio/{id}` and, with the optional segment, at
 * `/{id}/settings|code|preview` — deep links straight into a tab. One route
 * serves both so the heavy studio (live chat thread, running agent loop, mounted
 * sandbox iframe) is never remounted just to change tab; the studio itself keeps
 * the URL in step via history.replaceState. An unknown segment falls back to the
 * default tab rather than 404ing.
 */
export default function EditGameStudioPage() {
  const params = useParams<{ id: string; tab?: string[] }>();
  const id = params.id;
  const segment = params.tab?.[0];
  const initialView: StudioView | undefined = isStudioView(segment)
    ? segment
    : undefined;

  const [initialGame, setInitialGame] = useState<StudioGame | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      // The store decrypts the row; StudioGame below is entirely plaintext.
      const [{ data: userData }, game, sharingRes] = await Promise.all([
        supabase.auth.getUser(),
        useGameStore.getState().loadOne(id),
        dodi.request(`/api/games/${id}/sharing`),
      ]);
      if (cancelled) return;

      const user = userData.user;
      if (!game) {
        setMissing(true);
        return;
      }
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

      const metadata = (game.metadata ?? {}) as GameMetadata;
      setInitialGame({
        id: game.id,
        title: game.title,
        tags: game.tags,
        description: game.description,
        learningGoal: game.learning_goal,
        successDefinition: game.success_definition,
        progressKind: coerceProgressKind(game.progress_kind),
        targetAgeMin: game.target_age_min,
        targetAgeMax: game.target_age_max,
        codeBundle: game.code_bundle,
        currentGameVersionId: game.current_game_version_id,
        markdown: game.markdown,
        audienceIds,
        isFamily: sharing.family,
        // "Built" once Dodi has replaced the unbuilt placeholder with real code.
        built: !isUnbuiltBundle(game.code_bundle),
        isActive: game.is_active,
        perspective: metadata.perspective ?? null,
        generateBackgroundImage: Boolean(metadata.generateBackgroundImage),
        capabilities: metadata.capabilities ?? [],
        previewImage: game.preview_image,
        // Sealed prior conversation — the studio unseals it to resume editing.
        agentTranscriptEnc: game.agent_transcript_enc,
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

  return <GameStudio initialGame={initialGame} initialView={initialView} />;
}
