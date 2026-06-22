import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Icon } from "@/components/shared/icon";
import { Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { PageHead, Section } from "@/components/parent/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listPersonas } from "@dodi/platform/services/personas";
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
    <div>
      <PageHead
        title={t("title")}
        sub={t("subtitle")}
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/parent/personas/new?import=true">{t("import")}</Link>
            </Button>
            <Button asChild>
              <Link href="/parent/personas/new">
                <Icon name="add" size={16} />
                {t("createPersona")}
              </Link>
            </Button>
          </div>
        }
      />

      <Section>
        {personas.map((persona) => (
          <Link
            key={persona.id}
            href={`/parent/personas/${persona.id}`}
            className="block"
          >
            <Row clickable>
              <div className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Icon name="sparkles" size={16} />
              </div>
              <RowMain>
                <RowTitle>
                  {persona.name}
                  {persona.is_system_default ? (
                    <Badge variant="blue">{t("default")}</Badge>
                  ) : (
                    <Badge variant="gray">{t("custom")}</Badge>
                  )}
                </RowTitle>
                <RowMeta className="truncate">
                  {persona.soul.split("\n").find((l) => l.startsWith("- "))?.replace(/^- /, "").replace(/\*\*/g, "") ?? t("noDescription")}
                </RowMeta>
              </RowMain>
              <Icon name="chevron_right" size={16} className="text-faint" />
            </Row>
          </Link>
        ))}
      </Section>
    </div>
  );
}
