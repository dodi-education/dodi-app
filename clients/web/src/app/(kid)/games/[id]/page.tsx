import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { GamePlayView } from "@/components/games/game-play-view";
import { createClient } from "@/lib/supabase/server";
import { getGame, isGameVisibleToProfile } from "@dodi/platform/services/games";
import { getProfile } from "@dodi/platform/services/profiles";
import { logMemoryEvent } from "@dodi/platform/services/system-logs";
import { getTranslation, applyTranslation } from "@dodi/platform/services/game-translations";
import { coerceProgressKind, coerceSuccessCriteria } from "@/lib/services/game-generation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export default async function GamePlayPage({ params }: RouteContext) {
  const { id } = await params;
  const t = await getTranslations("games");
  const cookieStore = await cookies();
  const profileId = cookieStore.get("dodi-active-profile")?.value;

  if (!profileId) {
    return (
      <div className="w-full max-w-xl rounded-2xl border bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-dodi-800">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("profileRequired")}</p>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const profile = await getProfile(supabase, profileId);
  if (!profile || profile.account_id !== user.id) {
    return (
      <div className="w-full max-w-xl rounded-2xl border bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-dodi-800">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("profileRequired")}</p>
      </div>
    );
  }

  const rawGame = await getGame(supabase, id);
  if (!rawGame) {
    notFound();
  }

  // Inactive or unshared games aren't reachable by kids, even via a direct URL.
  if (!(await isGameVisibleToProfile(supabase, rawGame, profile.id))) {
    notFound();
  }

  const translation = await getTranslation(supabase, rawGame.id, profile.language);
  const game = applyTranslation(rawGame, translation);

  void logMemoryEvent(supabase, {
    profile_id: profile.id,
    account_id: user.id,
    persona_id: profile.active_persona_id,
    event: "game_played",
    message: `Started game: ${game.title}`,
  });

  return (
    <GamePlayView
      gameId={game.id}
      profileId={profile.id}
      title={game.title}
      description={game.description}
      codeBundle={game.code_bundle}
      markdown={game.markdown}
      learningGoal={game.learning_goal}
      successDefinition={game.success_definition}
      successCriteria={coerceSuccessCriteria(game.success_criteria)}
      progressKind={coerceProgressKind(game.progress_kind)}
    />
  );
}
