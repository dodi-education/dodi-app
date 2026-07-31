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
import { decryptPersona } from "@dodi/vault";
import { useVaultStore } from "@/stores/vault-store";
import type { Persona, Activity } from "@dodi/types/database";

interface PersonaOption {
  id: string;
  name: string;
}

/** Non-memory kid activity kinds only (memory lives on the kid memory page). */
const EVENT_TYPES = [
  "session_start",
  "game_started",
  "game_command_executed",
  "game_command_failed",
  "snapshot_created",
  "snapshot_shared",
  "friend_request_sent",
  "friend_request_accepted",
] as const;

const EVENT_BADGE_VARIANTS: Record<string, "blue" | "destructive" | "gray"> = {
  session_start: "blue",
  game_started: "blue",
  game_command_failed: "destructive",
};

const PAGE_SIZE = 50;

function getEventLabel(
  event: string,
  t: ReturnType<typeof useTranslations>,
): string {
  const labelMap: Record<string, string> = {
    session_start: t("sessionStart"),
    game_started: t("gameStarted"),
    game_command_executed: t("gameCommandExecuted"),
    game_command_failed: t("gameCommandFailed"),
    snapshot_created: t("snapshotCreated"),
    snapshot_shared: t("snapshotShared"),
    friend_request_sent: t("friendRequestSent"),
    friend_request_accepted: t("friendRequestAccepted"),
  };
  return labelMap[event] ?? event;
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
    dodi
      .request("/api/personas")
      .then((r) => r.json())
      .then((data: Persona[]) => {
        if (!Array.isArray(data)) return;
        setPersonas(
          data.map((p) => {
            const dec = decryptPersona(session, p);
            return { id: dec.id, name: dec.name };
          }),
        );
      })
      .catch(() => {});
  }, [session]);

  const fetchRows = useCallback(
    async (offset: number, append: boolean) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filterKid !== "all") params.set("kidId", filterKid);
        if (filterPersona !== "all") params.set("personaId", filterPersona);
        if (filterEvent !== "all") params.set("event", filterEvent);
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(offset));

        const res = await dodi.request(`/api/activities?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch");

        const data: Activity[] = await res.json();
        setRows((prev) => (append ? [...prev, ...data] : data));
        setHasMore(data.length === PAGE_SIZE);
      } catch {
        // non-critical
      } finally {
        setLoading(false);
      }
    },
    [filterKid, filterPersona, filterEvent],
  );

  useEffect(() => {
    fetchRows(0, false);
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
      <div className="mb-6 flex flex-wrap gap-3">
        <Select value={filterKid} onValueChange={setFilterKid}>
          <SelectTrigger className="w-[180px]">
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
          <SelectTrigger className="w-[180px]">
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
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("filterEvent")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filterEvent")}</SelectItem>
            {EVENT_TYPES.map((ev) => (
              <SelectItem key={ev} value={ev}>
                {getEventLabel(ev, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 && !loading ? (
        <div className="rounded-lg border border-dashed border-border-strong px-5 py-8 text-center text-sm text-muted-foreground">
          {filterKid === "all" &&
          filterPersona === "all" &&
          filterEvent === "all"
            ? t("noLogs")
            : t("noResults")}
        </div>
      ) : (
        <Section title={t("heading")}>
          {rows.map((row) => (
            <Row key={row.id}>
              <RowMain>
                <RowTitle>
                  <span className="line-clamp-1 font-medium">
                    {row.game_id && gameNameMap.get(row.game_id)
                      ? `[${gameNameMap.get(row.game_id)}] ${row.message}`
                      : row.message}
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
              <Badge variant={EVENT_BADGE_VARIANTS[row.event] ?? "gray"}>
                {getEventLabel(row.event, t)}
              </Badge>
            </Row>
          ))}
        </Section>
      )}

      {hasMore && (
        <div className="flex justify-center">
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
