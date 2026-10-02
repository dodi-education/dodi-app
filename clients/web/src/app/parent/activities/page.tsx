"use client";

import { dodi } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Section } from "@/components/parent/section";
import { DotSep, Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { useDateFormat } from "@/components/providers/date-format-provider";
import { useAccountGames } from "@/hooks/use-games";
import { useKids } from "@/hooks/use-kids";
import {
  ACTIVITY_EVENT_TYPES,
  activityBadgeVariant,
  activityEventLabel,
  activityTitle,
  isUnfiltered,
  loadActivities,
  loadPersonaOptions,
} from "@dodi/client-state/activities";
import { useVaultStore } from "@/stores/vault-store";
import { cn } from "@/lib/utils";
import {
  activityEmpty,
  activityFilters,
  activityRowTitle,
  loadMoreRow,
} from "@dodi/ui-recipes";
import type { Activity } from "@dodi/types/database";

interface PersonaOption {
  id: string;
  name: string;
}

export default function ActivitiesPage() {
  const t = useTranslations("activities");
  const { formatDateTime } = useDateFormat();

  const [rows, setRows] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const { kids: kidList } = useKids();
  const kids = kidList ?? [];
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const session = useVaultStore((s) => s.session);

  const [filterKid, setFilterKid] = useState<string>("all");
  const [filterPersona, setFilterPersona] = useState<string>("all");
  const [filterEvent, setFilterEvent] = useState<string>("all");

  // Fetch filter options on mount. Account personas are encrypted, so decrypt
  // their names for the filter labels (the system default passes through).
  useEffect(() => {
    if (!session) return;
    void loadPersonaOptions(dodi, session).then(setPersonas);
  }, [session]);

  const fetchRows = useCallback(
    async (offset: number, append: boolean) => {
      setLoading(true);
      try {
        const page = await loadActivities(
          dodi,
          { kidId: filterKid, personaId: filterPersona, event: filterEvent },
          offset,
        );
        setRows((prev) => (append ? [...prev, ...page.rows] : page.rows));
        setHasMore(page.hasMore);
      } catch {
        // non-critical
      } finally {
        setLoading(false);
      }
    },
    [filterKid, filterPersona, filterEvent],
  );

  useEffect(() => {
    // Filter-driven fetch: fetchRows flags loading, then sets the page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchRows(0, false);
  }, [fetchRows]);

  const kidNameMap = new Map(kids.map((p) => [p.id, p.display_name]));

  // Game titles are E2EE, so an activity row references the game by id and the
  // name is resolved here from the decrypted cache — it is never written into
  // the plaintext `message` column.
  const { games: accountGames } = useAccountGames();
  const gameNameMap = new Map(
    (accountGames ?? []).map((g) => [g.id, g.title]),
  );

  return (
    <div>
      <div className={cn(activityFilters.web, activityFilters.box)}>
        <Select value={filterKid} onValueChange={setFilterKid}>
          <SelectTrigger className={activityFilters.trigger}>
            <SelectValue placeholder={t("filterKid")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filterKid")}</SelectItem>
            {kids.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterPersona} onValueChange={setFilterPersona}>
          <SelectTrigger className={activityFilters.trigger}>
            <SelectValue placeholder={t("filterPersona")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filterPersona")}</SelectItem>
            {personas.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterEvent} onValueChange={setFilterEvent}>
          <SelectTrigger className={activityFilters.trigger}>
            <SelectValue placeholder={t("filterEvent")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filterEvent")}</SelectItem>
            {ACTIVITY_EVENT_TYPES.map((ev) => (
              <SelectItem key={ev} value={ev}>
                {activityEventLabel(ev, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 && !loading ? (
        <div className={cn(activityEmpty.box, activityEmpty.text)}>
          {isUnfiltered({
            kidId: filterKid,
            personaId: filterPersona,
            event: filterEvent,
          })
            ? t("noLogs")
            : t("noResults")}
        </div>
      ) : (
        <Section title={t("heading")}>
          {rows.map((row) => (
            <Row key={row.id}>
              <RowMain>
                <RowTitle>
                  <span className={cn(activityRowTitle.web, activityRowTitle.text)}>
                    {activityTitle(row, gameNameMap)}
                  </span>
                </RowTitle>
                <RowMeta>
                  {filterKid === "all" && kidNameMap.get(row.kid_id) && (
                    <>
                      {kidNameMap.get(row.kid_id)}
                      <DotSep />
                    </>
                  )}
                  {formatDateTime(row.occurred_at ?? row.created_at)}
                </RowMeta>
              </RowMain>
              <Badge variant={activityBadgeVariant(row.event)}>
                {activityEventLabel(row.event, t)}
              </Badge>
            </Row>
          ))}
        </Section>
      )}

      {hasMore && (
        <div className={cn(loadMoreRow.web, loadMoreRow.box)}>
          <Button
            variant="outline"
            onClick={() => fetchRows(rows.length, true)}
            disabled={loading}
          >
            {loading ? "..." : t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
