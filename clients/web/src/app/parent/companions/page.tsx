"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect } from "react";

import { activeCompanionOf, companionNameOf, MAX_COMPANIONS_PER_KID } from "@dodi/client-state/companions";
import { personaAvatar } from "@dodi/ui-recipes";

import { PersonaList } from "@/components/parent/persona-list";
import { Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Icon } from "@/components/shared/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useKidStore } from "@/stores/kid-store";

type Tab = "companions" | "personas";

function CompanionsTab() {
  const t = useTranslations("companions");
  const tp = useTranslations("personas");
  const kids = useKidStore((s) => s.list);
  const loadList = useKidStore((s) => s.loadList);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  if (!kids) return null;
  if (kids.length === 0) {
    return (
      <Section>
        <Row>
          <RowMain>
            <RowMeta>{t("noKids")}</RowMeta>
          </RowMain>
        </Row>
      </Section>
    );
  }

  return (
    <>
      {kids.map((kid) => {
        const active = activeCompanionOf(kid);
        const isFull = kid.companions.length >= MAX_COMPANIONS_PER_KID;
        return (
          <Section
            key={kid.id}
            title={t("kidCompanions", { name: kid.display_name })}
            action={
              <Button asChild variant="outline" size="sm" disabled={isFull}>
                <Link
                  href={`/parent/companions/new?kid=${kid.id}`}
                  aria-disabled={isFull || undefined}
                  onClick={(e) => isFull && e.preventDefault()}
                >
                  <Icon name="add" size={14} />
                  {t("addCompanion")}
                </Link>
              </Button>
            }
          >
            {kid.companions.map((companion) => (
              <Link key={companion.id} href={`/parent/companions/${companion.id}`} className="block">
                <Row clickable>
                  <div className={cn(personaAvatar.web, personaAvatar.box)}>
                    <Icon name="personas" size={16} />
                  </div>
                  <RowMain>
                    <RowTitle>
                      {companionNameOf(companion)}
                      {companion.id === active?.id ? <Badge variant="blue">{t("active")}</Badge> : null}
                    </RowTitle>
                    <RowMeta>
                      {t("personaLine", { persona: companion.persona?.name ?? tp("useDefault") })}
                    </RowMeta>
                  </RowMain>
                  <Icon name="chevron_right" size={16} className="text-faint" />
                </Row>
              </Link>
            ))}
          </Section>
        );
      })}
    </>
  );
}

function CompanionsPageContent() {
  const t = useTranslations("companions");
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: Tab = searchParams.get("tab") === "personas" ? "personas" : "companions";

  return (
    <Tabs
      value={tab}
      onValueChange={(value) =>
        router.replace(value === "personas" ? "/parent/companions?tab=personas" : "/parent/companions")
      }
    >
      <TabsList>
        <TabsTrigger value="companions">
          <Icon name="personas" size={16} />
          {t("tabCompanions")}
        </TabsTrigger>
        <TabsTrigger value="personas">
          <Icon name="sparkles" size={16} />
          {t("tabPersonas")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="companions">
        <CompanionsTab />
      </TabsContent>
      <TabsContent value="personas">
        <PersonaList />
      </TabsContent>
    </Tabs>
  );
}

export default function CompanionsPage() {
  return (
    <Suspense>
      <CompanionsPageContent />
    </Suspense>
  );
}
