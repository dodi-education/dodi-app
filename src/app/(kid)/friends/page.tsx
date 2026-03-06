import { getTranslations } from "next-intl/server";

import { Icon } from "@/components/shared/icon";

export default async function FriendsPage() {
  const t = await getTranslations("kid");

  return (
    <div className="flex flex-col items-center gap-6 pt-8">
      <h1 className="text-2xl font-bold text-dodi-800">{t("friendsTitle")}</h1>
      <div className="w-full max-w-md rounded-2xl border-2 border-dashed border-dodi-200 bg-white p-8 text-center">
        <Icon name="friends" className="mx-auto h-10 w-10 text-dodi-700" />
        <p className="mt-3 text-sm text-muted-foreground">
          {t("friendsPlaceholder")}
        </p>
      </div>
    </div>
  );
}
