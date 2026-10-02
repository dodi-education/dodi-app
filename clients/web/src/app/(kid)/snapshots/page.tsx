import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { SnapshotLibrary } from "@/components/snapshots/snapshot-library";
import { BrowseContext } from "@/components/kid/browse-context";
import { cn } from "@/lib/utils";
import { kidRequiredCard } from "@dodi/ui-recipes";

export default async function SnapshotsPage() {
  const t = await getTranslations("snapshots");
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
      <SnapshotLibrary kidId={kidId} />
    </BrowseContext>
  );
}
