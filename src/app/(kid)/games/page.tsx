import { Suspense } from "react";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { GameLibrary } from "@/components/games/game-library";
import { BrowseContext } from "@/components/kid/browse-context";

export default async function GamesPage() {
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

  return (
    <BrowseContext profileId={profileId}>
      <Suspense>
        <GameLibrary profileId={profileId} />
      </Suspense>
    </BrowseContext>
  );
}
