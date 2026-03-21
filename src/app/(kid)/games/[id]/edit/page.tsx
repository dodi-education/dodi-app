import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { GameVoiceCreator } from "@/components/games/game-voice-creator";
import { createClient } from "@/lib/supabase/server";
import { ensureEditableGame, getGame } from "@/lib/services/games";
import { getProfile } from "@/lib/services/profiles";
import { logMemoryEvent } from "@/lib/services/system-logs";
import { getTranslation, applyTranslation } from "@/lib/services/game-translations";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export default async function GameEditPage({ params }: RouteContext) {
  const { id } = await params;
  const t = await getTranslations("games");
  const cookieStore = await cookies();
  const profileId = cookieStore.get("dodi-active-profile")?.value;

  if (!profileId) {
    return (
      <div className="w-full max-w-xl rounded-2xl border bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-dodi-800">{t("editTitleGeneric")}</h1>
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
        <h1 className="text-xl font-bold text-dodi-800">{t("editTitleGeneric")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("profileRequired")}</p>
      </div>
    );
  }

  const sourceGame = await getGame(supabase, id);
  if (!sourceGame) {
    notFound();
  }

  const sourceTranslation = await getTranslation(supabase, sourceGame.id, profile.language);
  const translatedSource = applyTranslation(sourceGame, sourceTranslation);

  const editable = await ensureEditableGame(supabase, id, user.id, profile.id, {
    remixTitle: `${translatedSource.title} (Remix)`,
  });

  if (editable.id !== id) {
    void logMemoryEvent(supabase, {
      profile_id: profile.id,
      account_id: user.id,
      persona_id: profile.active_persona_id,
      event: "game_cloned",
      message: `Cloned game "${translatedSource.title}" for remix as "${editable.title}"`,
    });

    redirect(`/games/${editable.id}/edit`);
  }

  const editTranslation = await getTranslation(supabase, editable.id, profile.language);
  const translatedEditable = applyTranslation(editable, editTranslation);

  return (
    <GameVoiceCreator
      profileId={profile.id}
      gameId={translatedEditable.id}
      title={translatedEditable.title}
      description={translatedEditable.description}
      codeBundle={translatedEditable.code_bundle}
      markdown={translatedEditable.markdown}
    />
  );
}
