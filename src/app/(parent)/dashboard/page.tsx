import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

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
import { listAgentSessions } from "@/lib/services/agent-sessions";
import { getDashboardStats } from "@/lib/services/dashboard";
import { listPersonas } from "@/lib/services/personas";
import { listProfiles } from "@/lib/services/profiles";
import { createClient } from "@/lib/supabase/server";

const AVATAR_PALETTE = [
  { bg: "bg-primary-soft-2", fg: "text-primary" },
  { bg: "bg-success-soft", fg: "text-success" },
  { bg: "bg-[#EFE9FA]", fg: "text-[#7456C4]" },
  { bg: "bg-[#FDF1DC]", fg: "text-[#B0782A]" },
];

const STATUS_BADGE_VARIANT: Record<
  string,
  "blue" | "success" | "destructive" | "gray"
> = {
  active: "blue",
  completed: "success",
  failed: "destructive",
  deactivated: "gray",
};

function avatarColor(index: number) {
  return AVATAR_PALETTE[index % AVATAR_PALETTE.length];
}

function formatElapsed(createdAt: string, finishedAt: string | null): string {
  const start = new Date(createdAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function ageFromBirthdate(birthdate: string | null): number | null {
  if (!birthdate) return null;
  const birth = new Date(birthdate);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
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

  const [profiles, personas, stats, sessions] = await Promise.all([
    listProfiles(supabase, user.id),
    listPersonas(supabase, user.id).catch(() => []),
    getDashboardStats(supabase, user.id).catch(() => ({
      sessionsToday: 0,
      sessionsThisWeek: 0,
      gamesCreated: 0,
    })),
    listAgentSessions(supabase, user.id, { limit: 5 }).catch(() => []),
  ]);

  const profileNames = new Map(profiles.map((p) => [p.id, p.display_name]));
  const personaNames = new Map(personas.map((p) => [p.id, p.name]));
  const profileIndex = new Map(profiles.map((p, i) => [p.id, i]));

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
              <Link href="/profiles/new">{t("createFirstProfile")}</Link>
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
            <Link href="/profiles/new">{t("addProfile")}</Link>
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
            href="/agent-sessions"
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
          sessions.map((session) => {
            const color = avatarColor(
              profileIndex.get(session.profile_id) ?? 0,
            );
            const profileName = profileNames.get(session.profile_id);
            return (
              <Link
                key={session.id}
                href="/agent-sessions"
                className="block"
              >
                <Row clickable>
                  <div
                    className={`flex size-[34px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${color.bg} ${color.fg}`}
                  >
                    {(profileName?.[0] ?? "?").toUpperCase()}
                  </div>
                  <RowMain>
                    <RowTitle>
                      <span className="line-clamp-1">
                        {session.task_prompt ||
                          (taskLabels[session.task_type] ?? session.task_type)}
                      </span>
                    </RowTitle>
                    <RowMeta>
                      {profileName ?? "—"}
                      <DotSep />
                      {new Date(session.created_at).toLocaleString(locale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                      <DotSep />
                      {formatElapsed(session.created_at, session.finished_at)}
                    </RowMeta>
                  </RowMain>
                  <Badge
                    variant={STATUS_BADGE_VARIANT[session.status] ?? "gray"}
                  >
                    {statusLabels[session.status] ?? session.status}
                  </Badge>
                  <Icon
                    name="chevron_right"
                    size={16}
                    className="text-faint"
                  />
                </Row>
              </Link>
            );
          })
        )}
      </Section>

      <Section title={t("profilesGlance")}>
        {profiles.map((profile, i) => {
          const color = avatarColor(i);
          const age = ageFromBirthdate(profile.birthdate);
          const personaName = profile.active_persona_id
            ? personaNames.get(profile.active_persona_id)
            : null;
          return (
            <Link
              key={profile.id}
              href={`/profiles/${profile.id}`}
              className="block"
            >
              <Row clickable>
                <div
                  className={`flex size-[34px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${color.bg} ${color.fg}`}
                >
                  {profile.display_name[0]?.toUpperCase()}
                </div>
                <RowMain>
                  <RowTitle>
                    {profile.display_name}
                    {age !== null ? (
                      <Badge variant="gray">{t("ageYears", { age })}</Badge>
                    ) : null}
                  </RowTitle>
                  <RowMeta>
                    {profile.language.toUpperCase()}
                    {personaName ? (
                      <>
                        <DotSep />
                        {personaName}
                      </>
                    ) : null}
                  </RowMeta>
                </RowMain>
                <Icon name="chevron_right" size={16} className="text-faint" />
              </Row>
            </Link>
          );
        })}
      </Section>
    </div>
  );
}
