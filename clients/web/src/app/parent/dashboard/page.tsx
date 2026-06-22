import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { ProfileAvatar, ProfileName } from "@/components/parent/profile-bits";
import { ProfilesGlance } from "@/components/parent/profiles-glance";
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
import { listAgentSessions } from "@dodi/platform/services/agent-sessions";
import { getDashboardStats } from "@dodi/platform/services/dashboard";
import { listProfiles } from "@dodi/platform/services/profiles";
import { createClient } from "@/lib/supabase/server";

const STATUS_BADGE_VARIANT: Record<
  string,
  "blue" | "success" | "destructive" | "gray"
> = {
  active: "blue",
  completed: "success",
  failed: "destructive",
  deactivated: "gray",
};

function formatElapsed(createdAt: string, finishedAt: string | null): string {
  const start = new Date(createdAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [t, ts, locale] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("agentSessions"),
    getLocale(),
  ]);

  // profiles fetched only for the count (empty state) + IDs; names/ages are
  // decrypted client-side in the ProfileAvatar/ProfileName/ProfilesGlance islands.
  const [profiles, stats, sessions] = await Promise.all([
    listProfiles(supabase, user.id),
    getDashboardStats(supabase, user.id).catch(() => ({
      sessionsToday: 0,
      sessionsThisWeek: 0,
      gamesCreated: 0,
    })),
    listAgentSessions(supabase, user.id, { limit: 5 }).catch(() => []),
  ]);

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

  if (profiles.length === 0) {
    return (
      <div>
        <PageHead title={t("title")} sub={t("subtitle")} />
        <Section>
          <div className="flex flex-col items-center gap-4 px-5 py-12">
            <Icon name="profiles" className="h-10 w-10 text-primary" />
            <div className="text-center">
              <h3 className="font-semibold">{t("noProfilesTitle")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("noProfilesDescription")}
              </p>
            </div>
            <Button asChild>
              <Link href="/parent/profiles/new">{t("createFirstProfile")}</Link>
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
            <Link href="/parent/profiles/new">{t("addProfile")}</Link>
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
                <ProfileAvatar
                  profileId={session.profile_id}
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
                    <ProfileName profileId={session.profile_id} />
                    <DotSep />
                    {new Date(session.created_at).toLocaleString(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
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

      <ProfilesGlance />
    </div>
  );
}
