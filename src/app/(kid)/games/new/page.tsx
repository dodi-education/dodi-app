import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { Icon } from "@/components/shared/icon";
import { KidButton } from "@/components/kid/kid-button";
import { GameVoiceCreator } from "@/components/games/game-voice-creator";

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
    <div className="flex h-full w-full flex-col gap-3.5">
      <div className="flex items-center gap-3.5">
        <KidButton asChild variant="back" size="sm">
          <Link href="/games">
            <Icon name="arrow_left" size={15} stroke={2.2} />
            {t("title")}
          </Link>
        </KidButton>
        <h1 className="text-[21px] font-extrabold text-ink">
          {t("newGameTitle")}
        </h1>
      </div>
      <GameVoiceCreator profileId={profileId} />
    </div>
  );
}
