import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { GameRemixControls } from "@/components/games/game-remix-controls";
import { Button } from "@/components/ui/button";
import { BrowseContext } from "@/components/kid/browse-context";

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

  return (
    <BrowseContext profileId={profileId}>
      <div className="w-full max-w-3xl space-y-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-dodi-800">{t("newGameTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("newGameSubtitle")}</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/games">{t("backToLibrary")}</Link>
          </Button>
        </div>

        <GameRemixControls mode="create" profileId={profileId} />
      </div>
    </BrowseContext>
  );
}
