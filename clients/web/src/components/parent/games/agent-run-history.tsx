"use client";

import { useTranslations } from "next-intl";

import { AgentRunTimeline } from "@/components/parent/games/agent-run-timeline";
import { Icon } from "@/components/shared/icon";
import {
  type AgentRunLog,
  type AgentRunOutcome,
  formatRunClock,
  runChecks,
} from "@/lib/games/agent-run-log";

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
    <details className="group mt-1">
      <summary className="text-faint hover:text-primary focus-visible:ring-ring flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md text-[12px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
        <Icon name="history" size={14} className="shrink-0" />
        <span>{t("runLogSummary")}</span>
        {meta.length > 0 && (
          <span className="text-[11.5px] font-normal">({meta.join(", ")})</span>
        )}
        <span
          aria-hidden
          className="text-[13px] transition-transform group-open:rotate-90 motion-reduce:transition-none"
        >
          ›
        </span>
      </summary>
      {run.entries.length > 0 ? (
        <AgentRunTimeline run={run} />
      ) : (
        <p className="text-faint text-[11.5px] italic">{t("runLogEmpty")}</p>
      )}
    </details>
  );
}
