import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { GameVoiceCreator } from "@/components/games/game-voice-creator";
import { GameViewShell } from "@/components/games/game-view-shell";

export default async function NewGamePage() {
  const t = await getTranslations("games");
  const cookieStore = await cookies();
  const profileId = cookieStore.get("dodi-active-profile")?.value;

  if (!profileId) {
    return (
      <div className="my-auto w-full max-w-xl rounded-[20px] bg-white p-6 text-center shadow-[0_2px_10px_rgba(34,56,78,0.05)]">
        <h1 className="text-xl font-extrabold text-ink">{t("newGameTitle")}</h1>
        <p className="mt-2 text-sm font-semibold text-muted-foreground">
          {t("profileRequired")}
        </p>
      </div>
    );
  }

  return (
    <GameViewShell
      backHref="/games"
      backLabel={t("title")}
      title={t("newGameTitle")}
    >
      <GameVoiceCreator profileId={profileId} />
    </GameViewShell>
  );
}
