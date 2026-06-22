import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageHead, Section } from "@/components/parent/section";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import {
  GameStudioList,
  type GameListItem,
} from "@/components/parent/games/game-studio-list";
import { createClient } from "@/lib/supabase/server";
import { listAccountGames } from "@/lib/services/games";
import { listProfiles } from "@/lib/services/profiles";
import { listAgentSessions } from "@/lib/services/agent-sessions";

export default async function GameStudioPage() {
  const t = await getTranslations("gameStudio");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const [games, profiles, activeSessions] = await Promise.all([
    listAccountGames(supabase, user.id),
    listProfiles(supabase, user.id),
    listAgentSessions(supabase, user.id, { status: "active" }),
  ]);

  const nameById = new Map(profiles.map((p) => [p.id, p.display_name]));
  const activeGameIds = activeSessions
    .map((s) => s.game_id)
    .filter((id): id is string => Boolean(id));

  // "Who can play" lives in game_sharings — load it once for the whole account
  // (RLS scopes to this account) and index by game.
  const { data: sharingRows } = await supabase
    .from("game_sharings")
    .select("game_id, profile_id");
  const sharingByGame = new Map<string, { family: boolean; profileIds: string[] }>();
  for (const row of sharingRows ?? []) {
    let entry = sharingByGame.get(row.game_id);
    if (!entry) {
      entry = { family: false, profileIds: [] };
      sharingByGame.set(row.game_id, entry);
    }
    if (row.profile_id === null) entry.family = true;
    else entry.profileIds.push(row.profile_id);
  }

  const items: GameListItem[] = games.map((g) => {
    const share = sharingByGame.get(g.id) ?? { family: false, profileIds: [] };
    // The owning kid (for kid-created games) always counts as audience.
    const audienceIds = new Set(share.profileIds);
    if (g.profile_id) audienceIds.add(g.profile_id);
    const kidNames = Array.from(audienceIds)
      .map((id) => nameById.get(id))
      .filter((name): name is string => Boolean(name));

    return {
      id: g.id,
      title: g.title,
      tags: g.tags,
      updatedAt: g.updated_at,
      isActive: g.is_active,
      isFamily: share.family,
      kidNames,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        title={t("title")}
        sub={t("subtitle")}
        action={
          <Button asChild>
            <Link href="/parent/game-studio/new">
              <Icon name="sparkles" size={16} />
              {t("newGame")}
            </Link>
          </Button>
        }
      />

      {/* Make-a-game CTA */}
      <Link
        href="/parent/game-studio/new"
        className="group flex items-center gap-4 rounded-2xl border border-primary-soft-2 bg-gradient-to-br from-primary-soft to-card px-4 py-4 transition-colors hover:border-primary"
      >
        <Image
          src="/images/dodi-active.png"
          alt=""
          width={52}
          height={52}
          className="h-[52px] w-[52px] shrink-0 object-contain"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold tracking-tight text-ink-1">
            {t("emptyTitle")}
          </div>
          <div className="mt-0.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
            {t("emptyDesc")}
          </div>
        </div>
        <Button className="hidden shrink-0 sm:inline-flex">
          <Icon name="sparkles" size={14} />
          {t("startBuilding")}
        </Button>
      </Link>

      <Section title={t("yourGames")} desc={t("yourGamesDesc")}>
        {items.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            {t("noGames")}
          </p>
        ) : (
          <GameStudioList items={items} activeGameIds={activeGameIds} />
        )}
      </Section>
    </div>
  );
}
