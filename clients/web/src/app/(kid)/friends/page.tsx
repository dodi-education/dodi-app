import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { friendsList, friendsNoKid } from "@dodi/ui-recipes";

import { BrowseContext } from "@/components/kid/browse-context";
import { FriendsApp } from "@/components/kid/friends/friends-app";
import { cn } from "@/lib/utils";

export default async function FriendsPage() {
  const t = await getTranslations("friends");
  const cookieStore = await cookies();
  const kidId = cookieStore.get("dodi-active-kid")?.value;

  if (!kidId) {
    return (
      <div className={cn(friendsNoKid.root, friendsNoKid.webRoot)}>
        <h1 className={friendsList.title}>
          {t("title")}
        </h1>
        <p className={friendsNoKid.text}>
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
