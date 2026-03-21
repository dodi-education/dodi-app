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
import type { AgentSessionRow } from "@/types/database";

interface ProfileOption {
  id: string;
  display_name: string;
}

const STATUS_OPTIONS = ["active", "completed", "failed", "deactivated"] as const;

const STATUS_BADGE_STYLES: Record<string, string> = {
  active: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  deactivated: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

const PROGRESS_BADGE_STYLES: Record<string, string> = {
  planning: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  building: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  testing: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  done: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

const PAGE_SIZE = 50;

function formatElapsed(createdAt: string, finishedAt: string | null): string {
  const start = new Date(createdAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export default function AgentSessionsPage() {
  const t = useTranslations("agentSessions");

  const [sessions, setSessions] = useState<AgentSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [filterProfile, setFilterProfile] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [deactivating, setDeactivating] = useState<string | null>(null);

  // Fetch profile options on mount
  useEffect(() => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then((data: ProfileOption[]) => {
        if (Array.isArray(data)) setProfiles(data);
      })
      .catch(() => {});
  }, []);

  const fetchSessions = useCallback(
    async (offset: number, append: boolean) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filterProfile !== "all") params.set("profileId", filterProfile);
        if (filterStatus !== "all") params.set("status", filterStatus);
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(offset));

        const res = await fetch(`/api/agent/sessions?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch");

        const data: AgentSessionRow[] = await res.json();
        setSessions((prev) => (append ? [...prev, ...data] : data));
        setHasMore(data.length === PAGE_SIZE);
      } catch {
        // non-critical
      } finally {
        setLoading(false);
      }
    },
    [filterProfile, filterStatus],
  );

  // Refetch when filters change
  useEffect(() => {
    fetchSessions(0, false);
  }, [fetchSessions]);

  // Auto-refresh active sessions every 5 seconds
  useEffect(() => {
    const hasActive = sessions.some((s) => s.status === "active");
    if (!hasActive) return;

    const timer = setInterval(() => {
      fetchSessions(0, false);
    }, 5000);
    return () => clearInterval(timer);
  }, [sessions, fetchSessions]);

  const handleDeactivate = async (sessionId: string) => {
    if (!confirm(t("deactivateConfirm"))) return;

    setDeactivating(sessionId);
    try {
      const res = await fetch(`/api/agent/sessions/${sessionId}/deactivate`, {
        method: "POST",
      });
      if (res.ok) {
        // Refresh the list
        await fetchSessions(0, false);
      }
    } catch {
      // non-critical
    } finally {
      setDeactivating(null);
    }
  };

  const profileNameMap = new Map(profiles.map((p) => [p.id, p.display_name]));

  const getStatusLabel = (status: string): string => {
    const map: Record<string, string> = {
      active: t("statusActive"),
      completed: t("statusCompleted"),
      failed: t("statusFailed"),
      deactivated: t("statusDeactivated"),
    };
    return map[status] ?? status;
  };

  const getProgressLabel = (progress: string): string => {
    const map: Record<string, string> = {
      planning: t("progressPlanning"),
      building: t("progressBuilding"),
      testing: t("progressTesting"),
      done: t("progressDone"),
    };
    return map[progress] ?? progress;
  };

  const getTaskLabel = (taskType: string): string => {
    const map: Record<string, string> = {
      generate_game: t("taskGenerate"),
      update_game: t("taskUpdate"),
    };
    return map[taskType] ?? taskType;
  };

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

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("filterStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filterStatus")}</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {getStatusLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Session list */}
      {sessions.length === 0 && !loading ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          {filterProfile === "all" && filterStatus === "all"
            ? t("noSessions")
            : t("noResults")}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-start gap-3 rounded-lg border p-3"
            >
              <div className="flex flex-col gap-1">
                <Badge
                  variant="secondary"
                  className={STATUS_BADGE_STYLES[session.status] ?? ""}
                >
                  {session.status === "active" && (
                    <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                  )}
                  {getStatusLabel(session.status)}
                </Badge>
                <Badge
                  variant="outline"
                  className={PROGRESS_BADGE_STYLES[session.progress] ?? ""}
                >
                  {getProgressLabel(session.progress)}
                </Badge>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {getTaskLabel(session.task_type)}
                  </span>
                  {filterProfile === "all" && profileNameMap.get(session.profile_id) && (
                    <span className="text-xs text-muted-foreground">
                      {profileNameMap.get(session.profile_id)}
                    </span>
                  )}
                </div>
                {session.task_prompt && (
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                    {session.task_prompt}
                  </p>
                )}
                {session.error && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {session.error}
                  </p>
                )}
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    {new Date(session.created_at).toLocaleString()}
                  </span>
                  <span>
                    {t("elapsed")}: {formatElapsed(session.created_at, session.finished_at)}
                  </span>
                </div>
              </div>
              {session.status === "active" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                  disabled={deactivating === session.id}
                  onClick={() => handleDeactivate(session.id)}
                >
                  {deactivating === session.id ? "..." : t("deactivate")}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => fetchSessions(sessions.length, true)}
            disabled={loading}
          >
            {loading ? "..." : t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
