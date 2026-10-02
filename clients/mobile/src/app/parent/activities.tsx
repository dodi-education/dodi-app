import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import {
  NO_ACTIVITY_FILTERS,
  type ActivityFilters as Filters,
  activityBadgeVariant,
  activityEventLabel,
  activityTitle,
  isUnfiltered,
  loadActivities,
  loadPersonaOptions,
} from "@dodi/client-state/activities";
import type { Activity } from "@dodi/types/database";
import { activityEmpty, activityRowTitle, loadMoreRow, row } from "@dodi/ui-recipes";

import { api } from "@/adapters/platform";
import { ActivityFilters } from "@/components/insights/activity-filters";
import { DotSep, Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { ShellContent } from "@/components/shared/shell-content";
import { Badge, Button, Text } from "@/components/ui";
import { useVaultStore } from "@/lib/client-state";
import { cn } from "@/lib/cn";
import { useAccountDateFormat } from "@/lib/date-format";
import { useAccountGames } from "@/lib/use-account-games";
import { useKids } from "@/lib/use-kids";

/**
 * The kids' activity feed (web: parent/activities/page): filter by kid,
 * persona and event, 50 rows a page. Game titles come from the decrypted
 * game cache, never from the plaintext activity message.
 */
export default function ActivitiesScreen() {
  const t = useTranslations("activities");
  const { formatDateTime } = useAccountDateFormat();
  const [rows, setRows] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const { kids: kidList } = useKids();
  const kids = kidList ?? [];
  const [personas, setPersonas] = useState<{ id: string; name: string }[]>([]);
  const session = useVaultStore((s) => s.session);
  const [filters, setFilters] = useState<Filters>(NO_ACTIVITY_FILTERS);

  // Filter options: account persona names are encrypted, decrypted here.
  useEffect(() => {
    if (!session) return;
    void loadPersonaOptions(api, session).then(setPersonas);
  }, [session]);

  const fetchRows = useCallback(
    async (offset: number, shouldAppend: boolean) => {
      setIsLoading(true);
      try {
        const page = await loadActivities(api, filters, offset);
        setRows((prev) => (shouldAppend ? [...prev, ...page.rows] : page.rows));
        setHasMore(page.hasMore);
      } catch {
        // non-critical
      } finally {
        setIsLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    // Filter-driven fetch: fetchRows flags loading, then sets the page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchRows(0, false);
  }, [fetchRows]);

  const kidNameMap = new Map(kids.map((k) => [k.id, k.display_name]));
  const { games: accountGames } = useAccountGames();
  const gameNameMap = new Map((accountGames ?? []).map((g) => [g.id, g.title]));

  return (
    <ShellContent>
      <ActivityFilters
        filters={filters}
        kids={kids.map((k) => ({ id: k.id, name: k.display_name }))}
        personas={personas}
        onChange={setFilters}
      />

      {rows.length === 0 && !isLoading ? (
        <View className={activityEmpty.box}>
          <Text className={activityEmpty.text}>{isUnfiltered(filters) ? t("noLogs") : t("noResults")}</Text>
        </View>
      ) : (
        <Section title={t("heading")}>
          {rows.map((r) => (
            <Row key={r.id}>
              <RowMain>
                <RowTitle>
                  <Text className={cn(row.titleText, activityRowTitle.text)} numberOfLines={1}>
                    {activityTitle(r, gameNameMap)}
                  </Text>
                </RowTitle>
                <RowMeta>
                  {filters.kidId === "all" && kidNameMap.get(r.kid_id) ? (
                    <>
                      {kidNameMap.get(r.kid_id)}
                      <DotSep />
                    </>
                  ) : null}
                  {formatDateTime(r.occurred_at ?? r.created_at)}
                </RowMeta>
              </RowMain>
              <Badge variant={activityBadgeVariant(r.event)}>{activityEventLabel(r.event, t)}</Badge>
            </Row>
          ))}
        </Section>
      )}

      {hasMore ? (
        <View className={loadMoreRow.box}>
          <Button variant="outline" disabled={isLoading} onPress={() => void fetchRows(rows.length, true)}>
            {isLoading ? "..." : t("loadMore")}
          </Button>
        </View>
      ) : null}
    </ShellContent>
  );
}
