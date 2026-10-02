import { type Href, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import {
  type DashboardStats,
  EMPTY_DASHBOARD_STATS,
  loadDashboardStats,
} from "@dodi/client-state/dashboard";

import { api } from "@/adapters/platform";
import { AiSetupCard } from "@/components/parent/ai-setup-card";
import { KidsGlance } from "@/components/parent/kids-glance";
import { PageActions, Section } from "@/components/parent/section";
import { StatCell, StatStrip } from "@/components/parent/stat-strip";
import { ShellContent } from "@/components/shared/shell-content";
import { Button, Icon, Text } from "@/components/ui";
import { useKidStore } from "@/lib/client-state";

/** The parent dashboard (web: parent/dashboard/page), as it renders on a phone. */
export default function DashboardScreen() {
  const t = useTranslations("dashboard");
  const router = useRouter();
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

  // Still loading the (decrypted) kid list: the breadcrumb carries the title.
  if (kids === null) return null;

  if (kids.length === 0) {
    return (
      <ShellContent>
        <AiSetupCard />
        <Section>
          <View className="flex-col items-center gap-4 px-5 py-12">
            <Icon name="kids" size={40} color="primary" />
            <View>
              <Text className="text-center font-semibold" accessibilityRole="header">
                {t("noKidsTitle")}
              </Text>
              <Text className="text-center text-sm text-muted-foreground">{t("noKidsDescription")}</Text>
            </View>
            <Button onPress={() => router.push("/parent/kids/new" as Href)}>{t("addKid")}</Button>
          </View>
        </Section>
      </ShellContent>
    );
  }

  return (
    <ShellContent>
      <PageActions>
        <Button icon="sparkles" onPress={() => router.push("/parent/game-studio/new" as Href)}>
          {t("addGame")}
        </Button>
      </PageActions>

      <AiSetupCard />

      <Section title={t("overview")}>
        <StatStrip>
          <StatCell num={stats.sessionsToday} label={t("statSessionsToday")} />
          <StatCell num={stats.sessionsThisWeek} label={t("statSessionsWeek")} />
          <StatCell num={stats.gamesCreated} label={t("statGamesCreated")} />
        </StatStrip>
      </Section>

      <KidsGlance />
    </ShellContent>
  );
}
