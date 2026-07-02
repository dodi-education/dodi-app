"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useDateFormat } from "@/components/providers/date-format-provider";
import { KidInitialAvatar, KidNameLabel } from "@/components/parent/kid-bits";
import { KidsGlance } from "@/components/parent/kids-glance";
import {
  DotSep,
  Row,
  RowMain,
  RowMeta,
  RowTitle,
} from "@/components/parent/rows";
import { PageHead, Section } from "@/components/parent/section";
import { StatCell, StatStrip } from "@/components/parent/stat-strip";
import { Icon } from "@/components/shared/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useKids } from "@/hooks/use-kids";
import { dodi } from "@/lib/api";
import type { AgentSessionRow } from "@dodi/types/database";

interface DashboardStats {
  sessionsToday: number;
  sessionsThisWeek: number;
  gamesCreated: number;
}

const STATUS_BADGE_VARIANT: Record<
  string,
  "blue" | "success" | "destructive" | "gray"
> = {
  active: "blue",
  completed: "success",
  failed: "destructive",
  deactivated: "gray",
};

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const ts = useTranslations("agentSessions");
  const { formatDateTime, formatElapsed } = useDateFormat();

  // kids fetched only for the count (empty state) + IDs; names/ages are
  // decrypted client-side in the KidInitialAvatar/KidNameLabel/KidsGlance islands.
  const { kids } = useKids();
  const [stats, setStats] = useState<DashboardStats>({
    sessionsToday: 0,
    sessionsThisWeek: 0,
    gamesCreated: 0,
  });
  const [sessions, setSessions] = useState<AgentSessionRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    dodi
      .request("/api/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DashboardStats | null) => {
        if (!cancelled && d) setStats(d);
      })
      .catch(() => {});
    dodi
      .request("/api/agent/sessions?limit=5")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: AgentSessionRow[] | null) => {
        if (!cancelled && Array.isArray(d)) setSessions(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const statusLabels: Record<string, string> = {
    active: ts("statusActive"),
    completed: ts("statusCompleted"),
    failed: ts("statusFailed"),
    deactivated: ts("statusDeactivated"),
  };
  const taskLabels: Record<string, string> = {
    generate_game: ts("taskGenerate"),
    update_game: ts("taskUpdate"),
  };

  // Still loading the (decrypted) kid list — hold the page chrome.
  if (kids === null) {
    return <PageHead title={t("title")} sub={t("subtitle")} />;
  }

  if (kids.length === 0) {
    return (
      <div>
        <PageHead title={t("title")} sub={t("subtitle")} />
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
      <PageHead
        title={t("title")}
        sub={t("subtitle")}
        action={
          <Button asChild>
            <Link href="/parent/kids/new">{t("addKid")}</Link>
          </Button>
        }
      />

      <Section>
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

      <Section
        title={t("recentSessions")}
        desc={t("recentSessionsDesc")}
        action={
          <Link
            href="/parent/agent-sessions"
            className="text-[13px] font-semibold text-muted-foreground transition-colors hover:text-primary"
          >
            {t("viewAll")}
          </Link>
        }
      >
        {sessions.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            {t("noRecentSessions")}
          </div>
        ) : (
          sessions.map((session, i) => (
            <Link key={session.id} href="/parent/agent-sessions" className="block">
              <Row clickable>
                <KidInitialAvatar
                  kidId={session.kid_id}
                  fallbackIndex={i}
                />
                <RowMain>
                  <RowTitle>
                    <span className="line-clamp-1">
                      {session.task_prompt ||
                        (taskLabels[session.task_type] ?? session.task_type)}
                    </span>
                  </RowTitle>
                  <RowMeta>
                    <KidNameLabel kidId={session.kid_id} />
                    <DotSep />
                    {formatDateTime(session.created_at)}
                    <DotSep />
                    {formatElapsed(session.created_at, session.finished_at)}
                  </RowMeta>
                </RowMain>
                <Badge variant={STATUS_BADGE_VARIANT[session.status] ?? "gray"}>
                  {statusLabels[session.status] ?? session.status}
                </Badge>
                <Icon name="chevron_right" size={16} className="text-faint" />
              </Row>
            </Link>
          ))
        )}
      </Section>
      
    </div>
  );
}
