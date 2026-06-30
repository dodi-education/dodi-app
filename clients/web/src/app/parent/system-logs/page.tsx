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
import { PageHead, Section } from "@/components/parent/section";
import { DotSep, Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { useDateFormat } from "@/components/providers/date-format-provider";
import { useKids } from "@/hooks/use-kids";
import { decryptPersona } from "@dodi/vault";
import { useVaultStore } from "@/stores/vault-store";
import type { Persona, SystemLog } from "@dodi/types/database";

interface PersonaOption {
  id: string;
  name: string;
}

const EVENT_TYPES = [
  "session_start",
  "memory_stored",
  "memory_discarded",
  "memory_updated",
  "error",
] as const;

const EVENT_BADGE_VARIANTS: Record<string, "blue" | "destructive" | "gray"> = {
  session_start: "blue",
  error: "destructive",
};

const PAGE_SIZE = 50;

function getEventLabel(event: string, t: ReturnType<typeof useTranslations>): string {
  const labelMap: Record<string, string> = {
    session_start: t("sessionStart"),
    memory_stored: t("memoryStored"),
    memory_discarded: t("memoryDiscarded"),
    memory_updated: t("memoryUpdated"),
    error: t("error"),
  };
  return labelMap[event] ?? event;
}

export default function SystemLogsPage() {
  const t = useTranslations("systemLogs");
  const { formatDateTime } = useDateFormat();

  const [logs, setLogs] = useState<SystemLog[]>([]);
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
    dodi.request("/api/personas")
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

  const fetchLogs = useCallback(
    async (offset: number, append: boolean) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filterKid !== "all") params.set("kidId", filterKid);
        if (filterPersona !== "all") params.set("personaId", filterPersona);
        if (filterEvent !== "all") params.set("event", filterEvent);
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(offset));

        const res = await dodi.request(`/api/system-logs?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch");

        const data: SystemLog[] = await res.json();
        setLogs((prev) => (append ? [...prev, ...data] : data));
        setHasMore(data.length === PAGE_SIZE);
      } catch {
        // non-critical
      } finally {
        setLoading(false);
      }
    },
    [filterKid, filterPersona, filterEvent],
  );

  // Refetch when filters change
  useEffect(() => {
    fetchLogs(0, false);
  }, [fetchLogs]);

  const kidNameMap = new Map(kids.map((p) => [p.id, p.display_name]));

  return (
    <div>
      <PageHead title={t("title")} sub={t("subtitle")} />

      {/* Filter bar */}
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

      {/* Log list */}
      {logs.length === 0 && !loading ? (
        <div className="rounded-lg border border-dashed border-border-strong px-5 py-8 text-center text-sm text-muted-foreground">
          {filterKid === "all" && filterPersona === "all" && filterEvent === "all"
            ? t("noLogs")
            : t("noResults")}
        </div>
      ) : (
        <Section>
          {logs.map((log) => (
            <Row key={log.id}>
              <RowMain>
                <RowTitle>
                  <span className="line-clamp-1 font-medium">{log.message}</span>
                </RowTitle>
                <RowMeta>
                  {filterKid === "all" && kidNameMap.get(log.kid_id) && (
                    <>
                      {kidNameMap.get(log.kid_id)}
                      <DotSep />
                    </>
                  )}
                  {formatDateTime(log.created_at)}
                </RowMeta>
              </RowMain>
              <Badge variant={EVENT_BADGE_VARIANTS[log.event] ?? "gray"}>
                {getEventLabel(log.event, t)}
              </Badge>
            </Row>
          ))}
        </Section>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => fetchLogs(logs.length, true)}
            disabled={loading}
          >
            {loading ? "..." : t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
