import { notFound } from "next/navigation";

import {
  GameStudio,
  type StudioGame,
} from "@/components/parent/games/game-studio";
import { createClient } from "@/lib/supabase/server";
import { getGame, getGameSharing } from "@dodi/platform/services/games";
import { coerceProgressKind } from "@/lib/services/game-generation";
import { isUnbuiltBundle } from "@dodi/games/placeholder";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export default async function EditGameStudioPage({ params }: RouteContext) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const game = await getGame(supabase, id);
  if (!game || game.account_id !== user.id) {
    notFound();
  }

  // "Who can play" now lives in the game_sharings table.
  const sharing = await getGameSharing(supabase, game.id);
  const audienceIds = sharing.family
    ? []
    : sharing.profileIds.length > 0
      ? sharing.profileIds
      : game.profile_id
        ? [game.profile_id]
        : [];

  const initialGame: StudioGame = {
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
  };

  return <GameStudio initialGame={initialGame} />;
}
