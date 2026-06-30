import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { BrowseContext } from "@/components/kid/browse-context";
import { FriendsApp } from "@/components/kid/friends/friends-app";

export default async function FriendsPage() {
  const t = await getTranslations("friends");
  const cookieStore = await cookies();
  const kidId = cookieStore.get("dodi-active-kid")?.value;

  if (!kidId) {
    return (
      <div className="my-auto flex flex-col items-center gap-3 py-8 text-center">
        <h1 className="text-[27px] font-extrabold tracking-tight text-ink">
          {t("title")}
        </h1>
        <p className="text-sm font-semibold text-muted-foreground">
          {t("emptyFriends")}
        </p>
      </div>
    );
  }

  return (
    <BrowseContext kidId={kidId}>
      {/* key on kidId: a kid switch (router.refresh) remounts the
          subtree, so per-kid state (friend keys, lists) never bleeds across. */}
      <FriendsApp key={kidId} kidId={kidId} />
    </BrowseContext>
  );
}
