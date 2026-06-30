import { Suspense } from "react";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { GameLibrary } from "@/components/games/game-library";
import { BrowseContext } from "@/components/kid/browse-context";

export default async function GamesPage() {
  const t = await getTranslations("games");
  const cookieStore = await cookies();
  const kidId = cookieStore.get("dodi-active-kid")?.value;

  if (!kidId) {
    return (
      <div className="my-auto w-full max-w-xl rounded-[20px] bg-white p-6 text-center shadow-[0_2px_10px_rgba(34,56,78,0.05)]">
        <h1 className="text-xl font-extrabold text-ink">{t("title")}</h1>
        <p className="mt-2 text-sm font-semibold text-muted-foreground">
          {t("kidRequired")}
        </p>
      </div>
    );
  }

  return (
    <BrowseContext kidId={kidId}>
      <Suspense>
        <GameLibrary kidId={kidId} />
      </Suspense>
    </BrowseContext>
  );
}
