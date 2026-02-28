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
import { listPersonas } from "@/lib/services/personas";
import { createClient } from "@/lib/supabase/server";

export default async function PersonasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("personas");

  const personas = await listPersonas(supabase, user.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/personas/new?import=true">{t("import")}</Link>
          </Button>
          <Button asChild>
            <Link href="/personas/new">{t("createPersona")}</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {personas.map((persona) => (
          <Link key={persona.id} href={`/personas/${persona.id}`}>
            <Card className="transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-lg">{persona.name}</CardTitle>
                  <CardDescription>
                    {persona.soul.split("\n").find((l) => l.startsWith("- "))?.replace(/^- /, "").replace(/\*\*/g, "") ?? t("noDescription")}
                  </CardDescription>
                </div>
                {persona.is_system_default ? (
                  <Badge variant="secondary">{t("default")}</Badge>
                ) : (
                  <Badge variant="outline">{t("custom")}</Badge>
                )}
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {persona.is_system_default ? t("defaultHint") : t("customHint")}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
