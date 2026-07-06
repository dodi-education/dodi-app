"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { KidsGlance } from "@/components/parent/kids-glance";
import { PageActions, Section } from "@/components/parent/section";
import { StatCell, StatStrip } from "@/components/parent/stat-strip";
import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { useKids } from "@/hooks/use-kids";
import { dodi } from "@/lib/api";

interface DashboardStats {
  sessionsToday: number;
  sessionsThisWeek: number;
  gamesCreated: number;
}

export default function DashboardPage() {
  const t = useTranslations("dashboard");

  // kids fetched only for the count (empty state) + IDs; names/ages are
  // decrypted client-side in the KidsGlance island.
  const { kids } = useKids();
  const [stats, setStats] = useState<DashboardStats>({
    sessionsToday: 0,
    sessionsThisWeek: 0,
    gamesCreated: 0,
  });

  useEffect(() => {
    let cancelled = false;
    dodi
      .request("/api/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DashboardStats | null) => {
        if (!cancelled && d) setStats(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Still loading the (decrypted) kid list — the breadcrumb carries the title.
  if (kids === null) {
    return null;
  }

  if (kids.length === 0) {
    return (
      <div>
        <Section>
          <div className="flex flex-col items-center gap-4 px-5 py-12">
            <Icon name="kids" className="h-10 w-10 text-primary" />
            <div className="text-center">
              <h3 className="font-semibold">{t("noKidsTitle")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("noKidsDescription")}
              </p>
            </div>
            <Button asChild>
              <Link href="/parent/kids/new">{t("addKid")}</Link>
            </Button>
          </div>
        </Section>
      </div>
    );
  }

  return (
    <div>
      <PageActions>
        <Button asChild>
          <Link href="/parent/game-studio/new">
            <Icon name="sparkles" size={16} />
            {t("addGame")}
          </Link>
        </Button>
      </PageActions>

      <Section title={t("overview")}>
        <StatStrip>
          <StatCell num={stats.sessionsToday} label={t("statSessionsToday")} />
          <StatCell
            num={stats.sessionsThisWeek}
            label={t("statSessionsWeek")}
          />
          <StatCell num={stats.gamesCreated} label={t("statGamesCreated")} />
        </StatStrip>
      </Section>

      <KidsGlance />
    </div>
  );
}
