import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { GameVoiceCreator } from "@/components/games/game-voice-creator";

export default async function NewGamePage() {
  const t = await getTranslations("games");
  const cookieStore = await cookies();
  const profileId = cookieStore.get("dodi-active-profile")?.value;

  if (!profileId) {
    return (
      <div className="w-full max-w-xl rounded-2xl border bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-dodi-800">{t("newGameTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("profileRequired")}</p>
      </div>
    );
  }

  return <GameVoiceCreator profileId={profileId} />;
}
