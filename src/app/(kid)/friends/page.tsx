import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { Icon } from "@/components/shared/icon";
import { BrowseContext } from "@/components/kid/browse-context";

export default async function FriendsPage() {
  const t = await getTranslations("kid");
  const cookieStore = await cookies();
  const profileId = cookieStore.get("dodi-active-profile")?.value;

  const content = (
    <div className="my-auto flex flex-col items-center gap-6 py-8">
      <h1 className="text-[27px] font-extrabold tracking-tight text-ink">
        {t("friendsTitle")}
      </h1>
      <div className="w-full max-w-md rounded-[20px] border-2 border-dashed border-border-strong bg-white/70 p-8 text-center">
        <Icon name="friends" className="mx-auto h-10 w-10 text-primary" />
        <p className="mt-3 text-sm font-semibold text-muted-foreground">
          {t("friendsPlaceholder")}
        </p>
      </div>
    </div>
  );

  if (!profileId) {
    return content;
  }

  return (
    <BrowseContext profileId={profileId}>
      {content}
    </BrowseContext>
  );
}
