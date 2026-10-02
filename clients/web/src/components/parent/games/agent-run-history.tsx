"use client";

import { useTranslations } from "next-intl";

import { AgentRunTimeline } from "@/components/parent/games/agent-run-timeline";
import { Icon } from "@/components/shared/icon";
import {
  type AgentRunLog,
  type AgentRunOutcome,
  formatRunClock,
  runChecks,
} from "@dodi/studio/agent-run-log";
import { agentRun } from "@dodi/ui-recipes";
import { cn } from "@/lib/utils";

interface AgentRunHistoryProps {
  run: AgentRunLog;
}

const OUTCOME_KEYS: Record<AgentRunOutcome, string> = {
  completed: "runLogOutcomeCompleted",
  validation_failed: "runLogOutcomeValidationFailed",
  stopped: "runLogOutcomeStopped",
  failed: "runLogOutcomeFailed",
};

/**
 * "How dodi built this": a collapsed disclosure under a build's reply with the
 * run's timeline (narration, steps, screenshot checks). Native <details>, so
 * it is keyboard and screen-reader operable without extra wiring.
 */
export function AgentRunHistory({ run }: AgentRunHistoryProps) {
  const t = useTranslations("gameStudio");
  const checks = runChecks(run).length;
  const duration = formatRunClock(run.durationMs ?? 0);
  const meta = [
    run.outcome ? t(OUTCOME_KEYS[run.outcome], { duration }) : null,
    checks > 0 ? t("runLogChecks", { count: checks }) : null,
  ].filter((part): part is string => part !== null);

  return (
    <details className={cn(agentRun.webRoot, agentRun.root)}>
      <summary className={cn(agentRun.summary, agentRun.summaryText, agentRun.webSummary)}>
        <Icon name="history" size={14} className="shrink-0" />
        <span>{t("runLogSummary")}</span>
        {meta.length > 0 && (
          <span className={agentRun.summaryMeta}>({meta.join(", ")})</span>
        )}
        <span
          aria-hidden
          className={cn(agentRun.summaryChevron, agentRun.webSummaryChevron)}
        >
          ›
        </span>
      </summary>
      {run.entries.length > 0 ? (
        <AgentRunTimeline run={run} />
      ) : (
        <p className={agentRun.empty}>{t("runLogEmpty")}</p>
      )}
    </details>
  );
}
