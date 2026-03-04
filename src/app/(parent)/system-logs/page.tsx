"use client";

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
import type { SystemLog } from "@/types/database";

interface ProfileOption {
  id: string;
  display_name: string;
}

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

const EVENT_BADGE_STYLES: Record<string, string> = {
  session_start: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  memory_stored: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  memory_discarded: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  memory_updated: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  error: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
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

  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [personas, setPersonas] = useState<PersonaOption[]>([]);

  const [filterProfile, setFilterProfile] = useState<string>("all");
  const [filterPersona, setFilterPersona] = useState<string>("all");
  const [filterEvent, setFilterEvent] = useState<string>("all");

  // Fetch filter options on mount
  useEffect(() => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then((data: ProfileOption[]) => {
        if (Array.isArray(data)) setProfiles(data);
      })
      .catch(() => {});

    fetch("/api/personas")
      .then((r) => r.json())
      .then((data: PersonaOption[]) => {
        if (Array.isArray(data)) setPersonas(data);
      })
      .catch(() => {});
  }, []);

  const fetchLogs = useCallback(
    async (offset: number, append: boolean) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filterProfile !== "all") params.set("profileId", filterProfile);
        if (filterPersona !== "all") params.set("personaId", filterPersona);
        if (filterEvent !== "all") params.set("event", filterEvent);
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(offset));

        const res = await fetch(`/api/system-logs?${params.toString()}`);
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
    [filterProfile, filterPersona, filterEvent],
  );

  // Refetch when filters change
  useEffect(() => {
    fetchLogs(0, false);
  }, [fetchLogs]);

  const profileNameMap = new Map(profiles.map((p) => [p.id, p.display_name]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterProfile} onValueChange={setFilterProfile}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("filterProfile")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filterProfile")}</SelectItem>
            {profiles.map((p) => (
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
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          {filterProfile === "all" && filterPersona === "all" && filterEvent === "all"
            ? t("noLogs")
            : t("noResults")}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-3 rounded-lg border p-3"
            >
              <Badge
                variant="secondary"
                className={EVENT_BADGE_STYLES[log.event] ?? ""}
              >
                {getEventLabel(log.event, t)}
              </Badge>
              <div className="flex-1 min-w-0">
                <p className="text-sm">{log.message}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  {filterProfile === "all" && profileNameMap.get(log.profile_id) && (
                    <span>{profileNameMap.get(log.profile_id)}</span>
                  )}
                  <span>
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
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
