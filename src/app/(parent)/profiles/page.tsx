import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listProfiles } from "@/lib/services/profiles";
import { listPersonas } from "@/lib/services/personas";
import { createClient } from "@/lib/supabase/server";

export default async function ProfilesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("profiles");
  const profiles = await listProfiles(supabase, user.id);

  const personas = await listPersonas(supabase, user.id);
  const personaMap = new Map(personas.map((p) => [p.id, p.name]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        <Button asChild>
          <Link href="/profiles/new">{t("addProfile")}</Link>
        </Button>
      </div>

      {profiles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <p className="text-4xl">👦</p>
            <p className="text-sm text-muted-foreground">
              {t("noProfiles")}
            </p>
            <Button asChild>
              <Link href="/profiles/new">{t("createFirstProfile")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {profiles.map((profile) => (
            <Link key={profile.id} href={`/profiles/${profile.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-lg">
                      {profile.display_name}
                    </CardTitle>
                    <CardDescription>@{profile.name_tag}</CardDescription>
                  </div>
                  <Badge variant="secondary">
                    {profile.active_persona_id
                      ? personaMap.get(profile.active_persona_id) ?? t("default")
                      : t("default")}
                  </Badge>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {profile.birthdate
                    ? t("born", { date: profile.birthdate })
                    : t("birthdateNotSet")}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
