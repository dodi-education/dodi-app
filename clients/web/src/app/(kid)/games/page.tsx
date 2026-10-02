import { Suspense } from "react";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { GameLibrary } from "@/components/games/game-library";
import { BrowseContext } from "@/components/kid/browse-context";
import { cn } from "@/lib/utils";
import { kidRequiredCard } from "@dodi/ui-recipes";

export default async function GamesPage() {
  const t = await getTranslations("games");
  const cookieStore = await cookies();
  const kidId = cookieStore.get("dodi-active-kid")?.value;

  if (!kidId) {
    return (
      <div className={cn(kidRequiredCard.box, kidRequiredCard.web)}>
        <h1 className={kidRequiredCard.title}>{t("title")}</h1>
        <p className={kidRequiredCard.text}>
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
