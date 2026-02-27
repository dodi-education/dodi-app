import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getAccount } from "@/lib/services/accounts";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("settings");
  const account = await getAccount(supabase, user.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("accountTitle")}</CardTitle>
          <CardDescription>{t("accountDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-medium">{t("email")}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <Separator />
          <div>
            <p className="text-sm font-medium">{t("subscription")}</p>
            <p className="text-sm text-muted-foreground capitalize">
              {t("tierLabel", { tier: account?.subscription_tier ?? "free" })}
            </p>
          </div>
          <Separator />
          <div>
            <p className="text-sm font-medium">{t("accountId")}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {user.id}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("aiConfigTitle")}</CardTitle>
          <CardDescription>
            {t("aiConfigDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t("aiConfigPlaceholder")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
