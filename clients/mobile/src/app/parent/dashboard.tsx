import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import {
  type DashboardStats,
  EMPTY_DASHBOARD_STATS,
  loadDashboardStats,
} from "@dodi/client-state/dashboard";

import { api } from "@/adapters/platform";
import { AccountBadge } from "@/components/parent/account-badge";
import { AiSetupCard } from "@/components/parent/ai-setup-card";
import { KidsGlance } from "@/components/parent/kids-glance";
import { StatCell, StatStrip } from "@/components/parent/stat-strip";
import { Card, Screen, Text } from "@/components/ui";
import { IconUser } from "@/components/ui/icons";
import { useKidStore } from "@/lib/client-state";

/**
 * The parent dashboard (web: parent/dashboard): AI setup nudge, activity
 * stats and the kids at a glance. Adding kids and creating games arrive with
 * the kid and Game Studio screens.
 */
export default function DashboardScreen() {
  const t = useTranslations("dashboard");
  const kids = useKidStore((s) => s.list);
  const loadKids = useKidStore((s) => s.loadList);
  const [stats, setStats] = useState<DashboardStats>(EMPTY_DASHBOARD_STATS);

  // The parent layout's VaultGate guarantees an open vault, so names decrypt.
  useEffect(() => {
    if (kids === null) void loadKids().catch(() => {});
  }, [kids, loadKids]);

  useEffect(() => {
    let isCurrent = true;
    void loadDashboardStats(api).then((loaded) => {
      if (isCurrent && loaded) setStats(loaded);
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <Screen>
      <View className="gap-1">
        <Text variant="title">{t("title")}</Text>
        <Text variant="muted">{t("subtitle")}</Text>
      </View>
      <AccountBadge />
      {kids === null ? null : kids.length === 0 ? (
        <>
          <AiSetupCard />
          <Card>
            <View className="items-center gap-3 py-6">
              <IconUser size={40} color="#2F6BD8" />
              <Text className="font-semibold">{t("noKidsTitle")}</Text>
              <Text variant="muted" className="text-center">
                {t("noKidsDescription")}
              </Text>
            </View>
          </Card>
        </>
      ) : (
        <>
          <AiSetupCard />
          <Card title={t("overview")}>
            <StatStrip>
              <StatCell isFirst num={stats.sessionsToday} label={t("statSessionsToday")} />
              <StatCell num={stats.sessionsThisWeek} label={t("statSessionsWeek")} />
              <StatCell num={stats.gamesCreated} label={t("statGamesCreated")} />
            </StatStrip>
          </Card>
          <KidsGlance kids={kids} />
        </>
      )}
    </Screen>
  );
}
