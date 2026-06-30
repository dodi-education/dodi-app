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
import type { AgentSessionRow } from "@dodi/types/database";

const STATUS_OPTIONS = ["active", "completed", "failed", "deactivated"] as const;

const STATUS_BADGE_VARIANTS: Record<
  string,
  "blue" | "success" | "destructive" | "gray"
> = {
  active: "blue",
  completed: "success",
  failed: "destructive",
  deactivated: "gray",
};

const PAGE_SIZE = 50;

export default function AgentSessionsPage() {
  const t = useTranslations("agentSessions");
  const { formatDateTime, formatElapsed } = useDateFormat();

  const [sessions, setSessions] = useState<AgentSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const { kids: kidList } = useKids();
  const kids = kidList ?? [];
  const [filterKid, setFilterKid] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [deactivating, setDeactivating] = useState<string | null>(null);

  const fetchSessions = useCallback(
    async (offset: number, append: boolean) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filterKid !== "all") params.set("kidId", filterKid);
        if (filterStatus !== "all") params.set("status", filterStatus);
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(offset));

        const res = await dodi.request(`/api/agent/sessions?${params.toString()}`);
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
    [filterKid, filterStatus],
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
      const res = await dodi.request(`/api/agent/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "inactive" }),
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

  const kidNameMap = new Map(kids.map((p) => [p.id, p.display_name]));

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
        <div className="rounded-lg border border-dashed border-border-strong px-5 py-8 text-center text-sm text-muted-foreground">
          {filterKid === "all" && filterStatus === "all"
            ? t("noSessions")
            : t("noResults")}
        </div>
      ) : (
        <Section>
          {sessions.map((session) => (
            <Row key={session.id}>
              <RowMain>
                <RowTitle>
                  <span className="line-clamp-1">
                    {session.task_prompt || getTaskLabel(session.task_type)}
                  </span>
                </RowTitle>
                {session.error && (
                  <p className="mt-0.5 text-[12.5px] text-danger">
                    {session.error}
                  </p>
                )}
                <RowMeta>
                  {getTaskLabel(session.task_type)}
                  {filterKid === "all" &&
                    kidNameMap.get(session.kid_id) && (
                      <>
                        <DotSep />
                        {kidNameMap.get(session.kid_id)}
                      </>
                    )}
                  <DotSep />
                  {formatDateTime(session.created_at)}
                  <DotSep />
                  {t("elapsed")}: {formatElapsed(session.created_at, session.finished_at)}
                </RowMeta>
              </RowMain>
              <Badge variant={session.progress === "done" ? "success" : "gray"}>
                {getProgressLabel(session.progress)}
              </Badge>
              <Badge variant={STATUS_BADGE_VARIANTS[session.status] ?? "gray"}>
                {session.status === "active" && (
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
                )}
                {getStatusLabel(session.status)}
              </Badge>
              {session.status === "active" && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="shrink-0"
                  disabled={deactivating === session.id}
                  onClick={() => handleDeactivate(session.id)}
                >
                  {deactivating === session.id ? "..." : t("deactivate")}
                </Button>
              )}
            </Row>
          ))}
        </Section>
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
